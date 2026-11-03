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
    let mut args = std::env::args().skip(1);
    while let Some(flag) = args.next() {
        if flag == "--rw" {
            if let Some(root) = args.next() {
                let path = PathBuf::from(&root);
                rw_roots.push(path.canonicalize().unwrap_or(path));
            }
        }
    }
    if let Err(error) = landlock_restrict(&rw_roots) {
        // Fail CLOSED: without the sandbox the engine refuses to serve.
        eprintln!("kiro-toold: landlock init failed: {error}");
        std::process::exit(3);
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
        "execute_bash" => match execute_bash(&args) {
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

fn execute_bash(args: &serde_json::Value) -> Result<serde_json::Value, String> {
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
    let mut child = cmd.spawn().map_err(|e| format!("spawn bash: {e}"))?;
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
