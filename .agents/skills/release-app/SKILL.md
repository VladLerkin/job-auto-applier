---
name: release-app
description: Release a new version of the job-auto-applier (Bump version, Update Release Notes, Commit, Tag, Push)
---

When the user asks to release a new version of the app, follow these steps strictly:

1. **Bump Version:** Run `.agents/skills/release-app/scripts/up_version.sh` from the project root. This script will automatically increment the patch version in both `chrome-extension/manifest.json` and `agent-server/package.json`. Note the new version output by the script.
2. **Draft Release Notes:** Ask the user what changes should be included in the release notes, OR review the recent git commits to generate a summary of changes yourself.
3. **Update Changelog:** Update `RELEASE_NOTES.md` by prepending a new section for the new version right below the `# Release Notes` heading. Format it exactly as:
   `## v1.X.X`
   `**Release Date:** <Today's Date>`
   And then your list of changes.
4. **Publish Release:** Run `.agents/skills/release-app/scripts/release_app.sh` from the project root. This script will commit all changes, create an annotated git tag using your newly added release notes, and push the commit and tag to the remote repository.
