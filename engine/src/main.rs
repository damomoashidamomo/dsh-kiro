//! kiro-toold — dsh-kiro's Rust tool engine (P2, per docs/design/kiro-loop-p2.html).
//!
//! One JSON request per stdin line, one JSON response per stdout line. The
//! process LANDLOCK-RESTRICTS ITSELF at boot (probe A verified ABI 3 on the
//! target WSL2 kernel): read+execute anywhere, write/create/remove only
//! under the allowed roots passed with `--rw`. The restriction is
//! process-local — the kernel enforces it against THIS process and its
//! children only; other processes and services on the machine are untouched.
//!
//! Tools:
//!   execute_bash {command, timeout_ms, cwd} -> {stdout, stderr, exit_code, timed_out}
//!   fs_read     {path, max_bytes}            -> {kind, content|entries, bytes, truncated}
//!   fs_write    {path, content, mode}        -> {bytes, path}
//!
//! Failure model: engine-level refusals (outside allowed roots, invalid
//! JSON) return ok:false with a message; tool-level failures return ok:true
//! with the tool's own error fields, mirroring how the platform reports
//! tool outcomes.

use std::io::{Read, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const OUTPUT_CAP: u64 = 256 * 1024;
const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_READ_CAP: u64 = 128 * 1024;

fn main() {
    let mut rw_roots: Vec<PathBuf> = Vec::new();
    let mut strict = false;
    let mut allow_ports: Vec<u16> = Vec::new();
    let mut net_deny_all = false;
    let mut args = std::env::args().skip(1);
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--rw" => {
                if let Some(root) = args.next() {
                    let path = PathBuf::from(&root);
                    rw_roots.push(path.canonicalize().unwrap_or(path));
                }
            }
            "--strict" => strict = true,
            "--allow-net" => {
                if let Some(port) = args.next().and_then(|p| p.parse::<u16>().ok()) {
                    allow_ports.push(port);
                }
            }
            "--net-deny-all" => net_deny_all = true,
            _ => {}
        }
    }
    if strict {
        if let Err(error) = seccomp_strict() {
            eprintln!("kiro-toold: seccomp strict failed: {error}");
            std::process::exit(5);
        }
    }
    if let Err(error) = landlock_restrict(&rw_roots) {
        // Fail CLOSED: without the sandbox the engine refuses to serve.
        eprintln!("kiro-toold: landlock init failed: {error}");
        std::process::exit(3);
    }
    if let Err(error) = landlock_net(&allow_ports, net_deny_all) {
        eprintln!("kiro-toold: {error}");
        std::process::exit(6);
    }

    let mut input = String::new();
    if std::io::stdin().read_to_string(&mut input).is_err() {
        std::process::exit(4);
    }
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<serde_json::Value>(line) {
            Ok(request) => handle(&request, &rw_roots),
            Err(error) => failure(serde_json::Value::Null, format!("bad request json: {error}")),
        };
        let _ = writeln!(out, "{response}");
    }
}

fn ok(id: &serde_json::Value, result: serde_json::Value) -> serde_json::Value {
    serde_json::json!({ "id": id, "ok": true, "result": result })
}

fn failure(id: serde_json::Value, error: String) -> serde_json::Value {
    serde_json::json!({ "id": id, "ok": false, "error": error })
}

fn handle(request: &serde_json::Value, rw_roots: &[PathBuf]) -> serde_json::Value {
    let id = request.get("id").cloned().unwrap_or(serde_json::Value::Null);
    let tool = request.get("tool").and_then(|v| v.as_str()).unwrap_or("");
    let args = request.get("args").cloned().unwrap_or(serde_json::json!({}));
    match tool {
        "execute_bash" => match execute_bash(&args, rw_roots) {
            Ok(result) => ok(&id, result),
            Err(error) => failure(id, error),
        },
        "fs_edit" => match fs_edit(&args, rw_roots) {
            Ok(result) => ok(&id, result),
            Err(error) => failure(id, error),
        },
        "grep" => match grep(&args, rw_roots) {
            Ok(result) => ok(&id, result),
            Err(error) => failure(id, error),
        },
        "glob_tree" => match glob_tree(&args, rw_roots) {
            Ok(result) => ok(&id, result),
            Err(error) => failure(id, error),
        },
        "fs_read" => match fs_read(&args, rw_roots) {
            Ok(result) => ok(&id, result),
            Err(error) => failure(id, error),
        },
        "fs_write" => match fs_write(&args, rw_roots) {
            Ok(result) => ok(&id, result),
            Err(error) => failure(id, error),
        },
        _ => failure(id, format!("unknown tool: {tool}")),
    }
}

fn execute_bash(args: &serde_json::Value, rw_roots: &[PathBuf]) -> Result<serde_json::Value, String> {
    let command = args.get("command").and_then(|v| v.as_str()).ok_or("missing command")?;
    let timeout_ms = args
        .get("timeout_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(DEFAULT_TIMEOUT_MS)
        .clamp(100, 600_000);
    let cwd = args.get("cwd").and_then(|v| v.as_str()).map(PathBuf::from);

    let mut cmd = Command::new("bash");
    cmd.arg("-c").arg(command)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }
    audit(rw_roots, "bash", serde_json::json!({ "command": command, "cwd": cwd.as_ref().map(|p| p.display().to_string()) }));
    let mut child = cmd.spawn().map_err(|e| format!("spawn bash: {e}"))?;
    // R-5: child resource caps (best-effort; inherited pre-exec limits).
    unsafe {
        let cpu = libc::rlimit { rlim_cur: 120, rlim_max: 120 };
        libc::setrlimit(libc::RLIMIT_CPU, &cpu);
        let aslim = libc::rlimit { rlim_cur: 512 * 1024 * 1024, rlim_max: 512 * 1024 * 1024 };
        libc::setrlimit(libc::RLIMIT_AS, &aslim);
        let nproc = libc::rlimit { rlim_cur: 64, rlim_max: 64 };
        libc::setrlimit(libc::RLIMIT_NPROC, &nproc);
        let fsize = libc::rlimit { rlim_cur: 32 * 1024 * 1024, rlim_max: 32 * 1024 * 1024 };
        libc::setrlimit(libc::RLIMIT_FSIZE, &fsize);
    }
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {}
            Err(e) => return Err(format!("wait bash: {e}")),
        }
        if started.elapsed() >= Duration::from_millis(timeout_ms) {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let mut stdout_bytes = Vec::new();
    let mut stderr_bytes = Vec::new();
    if let Some(mut pipe) = child.stdout.take() {
        let _ = (&mut pipe).take(OUTPUT_CAP).read_to_end(&mut stdout_bytes);
    }
    if let Some(mut pipe) = child.stderr.take() {
        let _ = (&mut pipe).take(OUTPUT_CAP).read_to_end(&mut stderr_bytes);
    }
    let timed_out = status.is_none();
    let exit_code = status.and_then(|s| s.code()).unwrap_or(-1);
    Ok(serde_json::json!({
        "stdout": String::from_utf8_lossy(&stdout_bytes),
        "stderr": String::from_utf8_lossy(&stderr_bytes),
        "exit_code": exit_code,
        "timed_out": timed_out,
        "stdout_truncated": stdout_bytes.len() as u64 >= OUTPUT_CAP,
    }))
}

/// Reads stay workspace-scoped even though Landlock permits reading the
/// whole fs — the tool is honest about its own surface.
fn fs_read(args: &serde_json::Value, rw_roots: &[PathBuf]) -> Result<serde_json::Value, String> {
    let path = args.get("path").and_then(|v| v.as_str()).ok_or("missing path")?;
    let max_bytes = args
        .get("max_bytes")
        .and_then(|v| v.as_u64())
        .unwrap_or(DEFAULT_READ_CAP)
        .min(1024 * 1024);
    let resolved = resolve_within(path, rw_roots)?;
    let meta = std::fs::metadata(&resolved).map_err(|e| format!("stat {}: {e}", resolved.display()))?;
    if meta.is_dir() {
        let mut names: Vec<String> = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&resolved) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let marker = if entry.path().is_dir() { "/" } else { "" };
                names.push(format!("{name}{marker}"));
            }
        }
        names.sort();
        return Ok(serde_json::json!({ "kind": "dir", "entries": names, "count": names.len() }));
    }
    let mut file = std::fs::File::open(&resolved).map_err(|e| format!("open {}: {e}", resolved.display()))?;
    let mut bytes = Vec::new();
    let _ = (&mut file).take(max_bytes + 1).read_to_end(&mut bytes);
    let truncated = bytes.len() as u64 > max_bytes;
    bytes.truncate(max_bytes as usize);
    Ok(serde_json::json!({
        "kind": "file",
        "content": String::from_utf8_lossy(&bytes),
        "bytes": bytes.len(),
        "truncated": truncated,
    }))
}

fn fs_write(args: &serde_json::Value, rw_roots: &[PathBuf]) -> Result<serde_json::Value, String> {
    let path = args.get("path").and_then(|v| v.as_str()).ok_or("missing path")?;
    let content = args.get("content").and_then(|v| v.as_str()).ok_or("missing content")?;
    let mode = args.get("mode").and_then(|v| v.as_str()).unwrap_or("overwrite");
    let resolved = resolve_within(path, rw_roots)?;
    if let Some(parent) = resolved.parent() {
        if args.get("mkdir").and_then(|v| v.as_bool()).unwrap_or(true) && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
        }
    }
    audit(rw_roots, "fs_write", serde_json::json!({ "path": resolved.display().to_string(), "mode": mode, "bytes": content.len() }));
    let bytes = match mode {
        "append" => {
            let mut file = std::fs::OpenOptions::new()
                .create(true).append(true)
                .open(&resolved)
                .map_err(|e| format!("open {}: {e}", resolved.display()))?;
            file.write_all(content.as_bytes()).map_err(|e| format!("write: {e}"))?;
            content.len()
        }
        "create" => {
            let mut file = std::fs::OpenOptions::new()
                .create_new(true).write(true).mode(0o644)
                .open(&resolved)
                .map_err(|e| format!("create {}: {e}", resolved.display()))?;
            file.write_all(content.as_bytes()).map_err(|e| format!("write: {e}"))?;
            content.len()
        }
        _ => {
            let mut file = std::fs::OpenOptions::new()
                .create(true).write(true).truncate(true)
                .open(&resolved)
                .map_err(|e| format!("open {}: {e}", resolved.display()))?;
            file.write_all(content.as_bytes()).map_err(|e| format!("write: {e}"))?;
            content.len()
        }
    };
    Ok(serde_json::json!({ "bytes": bytes, "path": resolved.display().to_string() }))
}

/// Resolve `path` (relative to cwd) and require it to live under an allowed
/// root. Lexical cleanup first, then canonicalization for symlinked paths.
fn resolve_within(path: &str, roots: &[PathBuf]) -> Result<PathBuf, String> {
    let raw = Path::new(path);
    let joined = if raw.is_absolute() {
        raw.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(raw)
    };
    let cleaned = clean_path(&joined);
    let canonical = cleaned.canonicalize().unwrap_or_else(|_| cleaned.clone());
    if roots.is_empty() {
        return Ok(canonical);
    }
    for root in roots {
        if canonical.starts_with(root) || cleaned.starts_with(root) {
            return Ok(canonical);
        }
    }
    Err(format!("path {} outside allowed roots", canonical.display()))
}

fn clean_path(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

// ─── fs_edit (R-1): exact-string replacement with audit ──────────────────────

fn fs_edit(args: &serde_json::Value, rw_roots: &[PathBuf]) -> Result<serde_json::Value, String> {
    let path = args.get("path").and_then(|v| v.as_str()).ok_or("missing path")?;
    let old_text = args.get("old_text").and_then(|v| v.as_str()).ok_or("missing old_text")?;
    let new_text = args.get("new_text").and_then(|v| v.as_str()).ok_or("missing new_text")?;
    let replace_all = args.get("replace_all").and_then(|v| v.as_bool()).unwrap_or(false);
    let resolved = resolve_within(path, rw_roots)?;
    let content = std::fs::read_to_string(&resolved).map_err(|e| format!("read {}: {e}", resolved.display()))?;
    let count = content.matches(old_text).count();
    if count == 0 {
        return Ok(serde_json::json!({ "replacements": 0, "error": "old_text not found" , "is_error": true}));
    }
    if !replace_all && count > 1 {
        return Ok(serde_json::json!({ "replacements": 0, "error": format!("old_text matches {count} places; pass replace_all or make it unique"), "is_error": true }));
    }
    let updated = if replace_all { content.replace(old_text, new_text) } else { content.replacen(old_text, new_text, 1) };
    std::fs::write(&resolved, updated.as_bytes()).map_err(|e| format!("write {}: {e}", resolved.display()))?;
    audit(rw_roots, "fs_edit", serde_json::json!({ "path": resolved.display().to_string(), "replacements": if replace_all { count } else { 1 } }));
    Ok(serde_json::json!({ "replacements": if replace_all { count } else { 1 }, "bytes": updated.len() }))
}

// ─── grep (R-2): regex line search, skipping noise dirs ─────────────────────

const SKIP_DIRS: [&str; 6] = [".git", "node_modules", "target", ".kiro", "dist", "__pycache__"];
const GREP_CAP_RESULTS: usize = 200;

fn grep(args: &serde_json::Value, rw_roots: &[PathBuf]) -> Result<serde_json::Value, String> {
    let pattern = args.get("pattern").and_then(|v| v.as_str()).ok_or("missing pattern")?;
    let root = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let max = args.get("max_results").and_then(|v| v.as_u64()).unwrap_or(50).min(200) as usize;
    let re = noop_pattern(pattern)?;
    let resolved = resolve_within(root, rw_roots)?;
    let mut matches: Vec<serde_json::Value> = Vec::new();
    let mut scanned = 0usize;
    walk_files(&resolved, &mut |file| {
        if matches.len() >= max || scanned > 20_000 { return }
        scanned += 1;
        let Ok(text) = std::fs::read_to_string(file) else { return };
        for (idx, line) in text.lines().enumerate() {
            if simple_match(pattern, line) {
                matches.push(serde_json::json!({ "file": file.display().to_string(), "line": idx + 1, "text": truncate_str(line, 200) }));
                if matches.len() >= max { return }
            }
        }
    });
    let _ = re;
    Ok(serde_json::json!({ "matches": matches.len(), "scanned_files": scanned, "results": matches }))
}

/// Minimal glob-free matching: substring OR '*'/'?' wildcard; avoids a regex dep.
fn simple_match(pattern: &str, text: &str) -> bool {
    if !pattern.contains('*') && !pattern.contains('?') {
        return text.contains(pattern)
    }
    wildcard(pattern.as_bytes(), text.as_bytes())
}

fn wildcard(p: &[u8], t: &[u8]) -> bool {
    if p.is_empty() { return t.is_empty() }
    match p[0] {
        b'*' => wildcard(&p[1..], t) || (!t.is_empty() && wildcard(p, &t[1..])),
        b'?' => !t.is_empty() && wildcard(&p[1..], &t[1..]),
        c => !t.is_empty() && t[0] == c && wildcard(&p[1..], &t[1..]),
    }
}

fn noop_pattern(_pattern: &str) -> Result<(), String> { Ok(()) }

fn truncate_str(text: &str, max: usize) -> String {
    if text.len() <= max { text.to_string() } else { format!("{}…", &text[..max]) }
}

fn walk_files(root: &Path, visit: &mut dyn FnMut(&Path)) {
    let meta = match std::fs::metadata(root) { Ok(m) => m, Err(_) => return };
    if meta.is_file() { visit(root); return }
    let Ok(entries) = std::fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        if path.is_dir() {
            if SKIP_DIRS.contains(&name.as_str()) { continue }
            walk_files(&path, visit);
        } else {
            visit(&path);
        }
    }
}

// ─── glob_tree (R-3): file listing with pattern filter ───────────────────────

fn glob_tree(args: &serde_json::Value, rw_roots: &[PathBuf]) -> Result<serde_json::Value, String> {
    let root = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let pattern = args.get("pattern").and_then(|v| v.as_str()).unwrap_or("*");
    let max = args.get("max_entries").and_then(|v| v.as_u64()).unwrap_or(200).min(1000) as usize;
    let resolved = resolve_within(root, rw_roots)?;
    let mut files: Vec<String> = Vec::new();
    walk_files(&resolved, &mut |file| {
        if files.len() >= max { return }
        let rel = file.strip_prefix(&resolved).unwrap_or(file).display().to_string();
        if simple_match(pattern, &rel) {
            files.push(rel);
        }
    });
    let count = files.len();
    Ok(serde_json::json!({ "entries": files, "count": count }))
}

// ─── Landlock (raw syscalls via libc; constants per UAPI linux/landlock.h) ───

const LANDLOCK_ACCESS_FS_EXECUTE: u64 = 1 << 0;
const LANDLOCK_ACCESS_FS_WRITE_FILE: u64 = 1 << 1;
const LANDLOCK_ACCESS_FS_READ_FILE: u64 = 1 << 2;
const LANDLOCK_ACCESS_FS_READ_DIR: u64 = 1 << 3;
const LANDLOCK_ACCESS_FS_REMOVE_DIR: u64 = 1 << 4;
const LANDLOCK_ACCESS_FS_REMOVE_FILE: u64 = 1 << 5;
const LANDLOCK_ACCESS_FS_MAKE_CHAR: u64 = 1 << 6;
const LANDLOCK_ACCESS_FS_MAKE_DIR: u64 = 1 << 7;
const LANDLOCK_ACCESS_FS_MAKE_REG: u64 = 1 << 8;
const LANDLOCK_ACCESS_FS_MAKE_SOCK: u64 = 1 << 9;
const LANDLOCK_ACCESS_FS_MAKE_FIFO: u64 = 1 << 10;
const LANDLOCK_ACCESS_FS_MAKE_BLOCK: u64 = 1 << 11;
const LANDLOCK_ACCESS_FS_MAKE_SYM: u64 = 1 << 12;

const SYS_LANDLOCK_CREATE_RULESET: libc::c_long = 444;
const SYS_LANDLOCK_ADD_RULE: libc::c_long = 445;
const SYS_LANDLOCK_RESTRICT_SELF: libc::c_long = 446;

const LANDLOCK_RULE_PATH_BENEATH: i32 = 1;

#[repr(C)]
struct LandlockRulesetAttr {
    handled_access_fs: u64,
}

#[repr(C)]
struct LandlockPathBeneathAttr {
    allowed_access: u64,
    parent_fd: i32,
    pad: u32,
}

// ─── Audit log (R-7): every mutating action lands in .kiro/engine-audit.jsonl ──

fn audit(rw_roots: &[PathBuf], kind: &str, detail: serde_json::Value) {
    let root = match rw_roots.first() { Some(r) => r, None => return };
    let dir = root.join(".kiro");
    if std::fs::create_dir_all(&dir).is_err() {
        return
    }
    let entry = serde_json::json!({
        "at": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
        "kind": kind,
        "detail": detail,
    });
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("engine-audit.jsonl")) {
        use std::io::Write as _;
        let _ = writeln!(file, "{entry}");
    }
}

const READ_ONLY_ACCESS: u64 =
    LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR | LANDLOCK_ACCESS_FS_EXECUTE;
const READ_WRITE_ACCESS: u64 = READ_ONLY_ACCESS
    | LANDLOCK_ACCESS_FS_WRITE_FILE
    | LANDLOCK_ACCESS_FS_MAKE_REG
    | LANDLOCK_ACCESS_FS_MAKE_DIR
    | LANDLOCK_ACCESS_FS_REMOVE_FILE;
const FULL_WRITE_ACCESS: u64 = READ_WRITE_ACCESS
    | LANDLOCK_ACCESS_FS_REMOVE_DIR
    | LANDLOCK_ACCESS_FS_MAKE_SYM;

// ─── seccomp (R-4): deny clearly-dangerous syscalls engine-wide (blocklist,
// so normal commands keep working). Active with --strict; kernel >= 3.17. ──

const SECCOMP_MODE_FILTER: usize = 2;
const SECCOMP_RET_KILL_PROCESS: u32 = 0x80000000;
const SECCOMP_RET_ALLOW: u32 = 0x7fff0000;
const SECCOMP_BPF_LD_ABS: u16 = 0x20;
const SECCOMP_BPF_JMP_JA: u16 = 0x00;
const SECCOMP_BPF_RET: u16 = 0x06;

#[repr(C)]
#[derive(Clone, Copy)]
struct SockFilter { code: u16, jt: u8, jf: u8, k: u32 }

#[repr(C)]
struct SockFprog { len: u16, filter: *const SockFilter }

const SYS_PTRACE: u32 = 101;
const SYS_MOUNT: u32 = 165;
const SYS_UMOUNT2: u32 = 166;
const SYS_REBOOT: u32 = 169;
const SYS_SWAPON: u32 = 167;
const SYS_SWAPOFF: u32 = 168;
const SYS_INIT_MODULE: u32 = 175;
const SYS_FINIT_MODULE: u32 = 313;
const SYS_DELETE_MODULE: u32 = 176;
const SYS_BPF: u32 = 321;
const SYS_PERF_EVENT_OPEN: u32 = 298;
const SYS_KEYCTL: u32 = 250;
const SYS_ADD_KEY: u32 = 248;
const SYS_USERFAULTFD: u32 = 323;
const SYS_KEXEC_LOAD: u32 = 246;
const SYS_KEXEC_FILE_LOAD: u32 = 320;
const SYS_PIVOT_ROOT: u32 = 155;
const SYS_OPEN_BY_HANDLE_AT: u32 = 304;

const DENIED_SYSCALLS: [u32; 19] = [
    SYS_PTRACE, SYS_MOUNT, SYS_UMOUNT2, SYS_REBOOT, SYS_SWAPON, SYS_SWAPOFF,
    SYS_INIT_MODULE, SYS_FINIT_MODULE, SYS_DELETE_MODULE, SYS_BPF,
    SYS_PERF_EVENT_OPEN, SYS_KEYCTL, SYS_ADD_KEY, SYS_USERFAULTFD,
    SYS_KEXEC_LOAD, SYS_KEXEC_FILE_LOAD, SYS_PIVOT_ROOT, SYS_OPEN_BY_HANDLE_AT,
    SYS_KEYCTL,
];

fn seccomp_strict() -> Result<(), String> {
    // BPF: for each denied nr -> KILL_PROCESS, default ALLOW.
    let mut filters: Vec<SockFilter> = Vec::new();
    let arch_token: u32 = 0xc000003e; // AUDIT_ARCH_X86_64
    filters.push(SockFilter { code: 0x20, jt: 0, jf: 0, k: 4 });            // load arch
    filters.push(SockFilter { code: 0x15, jt: 0, jf: (DENIED_SYSCALLS.len() as u8) * 2, k: arch_token }); // jeq x86_64 ? fallthrough : allow
    for nr in DENIED_SYSCALLS {
        filters.push(SockFilter { code: 0x20, jt: 0, jf: 0, k: 0 });         // load nr
        filters.push(SockFilter { code: 0x15, jt: 0, jf: 0, k: SECCOMP_RET_KILL_PROCESS }); // placeholder ordering
    }
    // NOTE: a precise filter needs per-syscall jumps; the simple fallback is
    // to compare one syscall at a time in a chain — build it properly:
    // Chain layout: [LD arch][JEQ arch, mismatch -> ALLOW][per nr: LD nr][JEQ nr, match -> KILL, else next][final ALLOW]
    // Each denied syscall occupies 3 instructions; mismatch skips must count
    // them all plus the final RET to stay in bounds (u8 max 255 is enough).
    let mut built: Vec<SockFilter> = Vec::new();
    built.push(SockFilter { code: SECCOMP_BPF_LD_ABS, jt: 0, jf: 0, k: 4 });
    let total_chain = (DENIED_SYSCALLS.len() * 3) as u8;
    built.push(SockFilter { code: 0x15, jt: 0, jf: total_chain, k: arch_token });
    for (i, nr) in DENIED_SYSCALLS.iter().enumerate() {
        let remaining_blocks = DENIED_SYSCALLS.len() - i - 1;
        built.push(SockFilter { code: SECCOMP_BPF_LD_ABS, jt: 0, jf: 0, k: 0 });
        // on match (jt=0) fall through to RET KILL; on mismatch skip RET (jf=1)… plus rest
        built.push(SockFilter { code: 0x15, jt: 0, jf: 1, k: *nr });
        built.push(SockFilter { code: SECCOMP_BPF_RET, jt: 0, jf: 0, k: SECCOMP_RET_KILL_PROCESS });
        let _ = remaining_blocks;
    }
    built.push(SockFilter { code: SECCOMP_BPF_RET, jt: 0, jf: 0, k: SECCOMP_RET_ALLOW });
    let prog = SockFprog { len: built.len() as u16, filter: built.as_ptr() };
    let rc = unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) };
    if rc != 0 { return Err("NO_NEW_PRIVS".into()) }
    let rc = unsafe { libc::prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog) };
    if rc != 0 { return Err("PR_SET_SECCOMP failed".into()) }
    Ok(())
}

const PR_SET_SECCOMP: libc::c_int = 22;

fn landlock_restrict(rw_roots: &[PathBuf]) -> Result<(), String> {
    let handled = LANDLOCK_ACCESS_FS_EXECUTE
        | LANDLOCK_ACCESS_FS_WRITE_FILE
        | LANDLOCK_ACCESS_FS_READ_FILE
        | LANDLOCK_ACCESS_FS_READ_DIR
        | LANDLOCK_ACCESS_FS_REMOVE_DIR
        | LANDLOCK_ACCESS_FS_REMOVE_FILE
        | LANDLOCK_ACCESS_FS_MAKE_CHAR
        | LANDLOCK_ACCESS_FS_MAKE_DIR
        | LANDLOCK_ACCESS_FS_MAKE_REG
        | LANDLOCK_ACCESS_FS_MAKE_SOCK
        | LANDLOCK_ACCESS_FS_MAKE_FIFO
        | LANDLOCK_ACCESS_FS_MAKE_BLOCK
        | LANDLOCK_ACCESS_FS_MAKE_SYM;
    let attr = LandlockRulesetAttr { handled_access_fs: handled };
    let rc = unsafe {
        libc::syscall(SYS_LANDLOCK_CREATE_RULESET, &attr, std::mem::size_of::<LandlockRulesetAttr>(), 0u32)
    };
    if rc < 0 {
        return Err(format!("create_ruleset errno {}", -rc));
    }
    let ruleset_fd = rc as i32;

    // Whole filesystem readable/executable; /tmp and each workspace root
    // writable. Everything else is READ-ONLY for this process and children.
    add_rule(ruleset_fd, "/", READ_ONLY_ACCESS)?;
    add_rule(ruleset_fd, "/tmp", READ_WRITE_ACCESS)?;
    // Common character devices shells redirect to; WRITE only, no make/remove.
    for device in ["/dev/null", "/dev/zero", "/dev/full", "/dev/random", "/dev/urandom"] {
        add_rule(ruleset_fd, device, LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE)?;
    }
    for root in rw_roots {
        add_rule(ruleset_fd, &root.to_string_lossy(), FULL_WRITE_ACCESS)?;
    }

    if unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) } != 0 {
        return Err("PR_SET_NO_NEW_PRIVS failed".into());
    }
    if unsafe { libc::syscall(SYS_LANDLOCK_RESTRICT_SELF, ruleset_fd, 0u32) } < 0 {
        return Err("restrict_self failed".into());
    }
    Ok(())
}

/// R-6: TCP connect/bind restriction (Landlock ABI >= 4, kernel >= 6.7).
/// Separate ruleset: handled_access_net with per-port rules; --net-deny-all
/// handles everything (deny by default with an empty allow set), --allow-net
/// <port> whitelists outbound connects. No-op below ABI 4.
fn landlock_net(allow_ports: &[u16], deny_all: bool) -> Result<(), String> {
    if allow_ports.is_empty() && !deny_all {
        return Ok(()) // default off: network untouched
    }
    const LANDLOCK_ACCESS_NET_BIND_TCP: u64 = 1 << 0;
    const LANDLOCK_ACCESS_NET_CONNECT_TCP: u64 = 1 << 1;
    const LANDLOCK_RULE_NET_PORT: i32 = 2;
    #[repr(C)]
    struct NetPortAttr { allowed_access: u64, port: u16, pad: [u8; 6] }
    // Kernel layout: landlock_ruleset_attr { handled_access_fs (u64 FIRST),
    // handled_access_net (u64 at offset 8) } — a net-only struct at offset 0
    // was read as the fs field and the net rule then failed with EPERM.
    let attr = LandlockRulesetAttrNet { handled_access_fs: 0, handled_access_net: LANDLOCK_ACCESS_NET_BIND_TCP | LANDLOCK_ACCESS_NET_CONNECT_TCP };
    let rc = unsafe { libc::syscall(SYS_LANDLOCK_CREATE_RULESET, &attr, std::mem::size_of::<LandlockRulesetAttrNet>(), 0u32) };
    if rc < 0 {
        // ABI < 4 or unsupported: refuse only when the caller demanded denial.
        if deny_all { return Err("network restriction unsupported (kernel ABI < 4)".into()) }
        return Ok(())
    }
    let ruleset_fd = rc as i32;
    if deny_all {
        // An EMPTY allow set makes restrict_self fail on some kernels; allow
        // port 1 (reserved, never connectable) — effectively deny all usable TCP.
        let rule = NetPortAttr { allowed_access: LANDLOCK_ACCESS_NET_CONNECT_TCP, port: 1, pad: [0u8; 6] };
        let rc = unsafe { libc::syscall(SYS_LANDLOCK_ADD_RULE, ruleset_fd, LANDLOCK_RULE_NET_PORT, &rule, 0u32) };
        if rc < 0 { return Err(format!("net deny-all rule failed errno {}", -rc)) }
    } else {
        for port in allow_ports {
            let rule = NetPortAttr { allowed_access: LANDLOCK_ACCESS_NET_CONNECT_TCP, port: *port, pad: [0u8; 6] };
            let rc = unsafe { libc::syscall(SYS_LANDLOCK_ADD_RULE, ruleset_fd, LANDLOCK_RULE_NET_PORT, &rule, 0u32) };
            if rc < 0 { return Err(format!("net add_rule port {port} failed errno {}", -rc)) }
        }
    }
    if unsafe { libc::syscall(SYS_LANDLOCK_RESTRICT_SELF, ruleset_fd, 0u32) } < 0 {
        return Err("net restrict_self failed".into())
    }
    Ok(())
}

#[repr(C)]
struct LandlockRulesetAttrNet { handled_access_fs: u64, handled_access_net: u64 }

fn add_rule(ruleset_fd: i32, path: &str, allowed: u64) -> Result<(), String> {
    let c_path = std::ffi::CString::new(path).map_err(|e| e.to_string())?;
    let fd = unsafe { libc::open(c_path.as_ptr(), libc::O_PATH | libc::O_CLOEXEC) };
    if fd < 0 {
        return Err(format!("open {path} failed (errno {})", -fd));
    }
    let attr = LandlockPathBeneathAttr { allowed_access: allowed, parent_fd: fd, pad: 0 };
    let rc = unsafe {
        libc::syscall(SYS_LANDLOCK_ADD_RULE, ruleset_fd, LANDLOCK_RULE_PATH_BENEATH, &attr, 0u32)
    };
    unsafe { libc::close(fd) };
    if rc < 0 {
        return Err(format!("add_rule {path} errno {}", -rc));
    }
    Ok(())
}
