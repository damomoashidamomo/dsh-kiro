import { spawnSync } from 'node:child_process';
export const issueCommand = {
    name: 'issue',
    description: 'Create a GitHub issue with the current transcript',
    handler: async () => {
        const result = spawnSync('gh', ['--version'], { stdio: 'pipe' });
        if (result.error !== undefined || result.status !== 0) {
            return {
                kind: 'success',
                text: [
                    'gh CLI is not installed — please open an issue manually:',
                    '  https://github.com/damomoashidamomo/dsh-kiro/issues/new',
                ].join('\n'),
            };
        }
        return {
            kind: 'success',
            text: [
                'gh CLI detected. Drafted URL:',
                '  gh issue create --repo damomoashidamomo/dsh-kiro --title "<paste>" --body "<paste transcript>"',
            ].join('\n'),
        };
    },
};
//# sourceMappingURL=issue.js.map