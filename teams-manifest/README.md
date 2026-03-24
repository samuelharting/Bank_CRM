# Teams Tab Manifest Setup

1. Replace placeholders in `manifest.json`:
   - `{{TEAMS_APP_ID}}`
   - `{{APP_URL}}`
   - `{{APP_DOMAIN}}`
   - `{{AZURE_CLIENT_ID}}`
2. Add icon files in this folder:
   - `color.png` (192x192)
   - `outline.png` (32x32, transparent)
3. Zip these files at root of zip:
   - `manifest.json`
   - `color.png`
   - `outline.png`
4. Upload the zip to Teams Admin Center:
   - Teams apps -> Manage apps -> Upload new app
5. Assign app permissions and publish to users.
