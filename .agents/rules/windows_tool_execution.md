# Windows PowerShell Tool Execution Guardrails

1. **Use .cmd Extensions for Node CLIs**:
   On Windows PowerShell shells, always invoke Node executable wrappers with `.cmd` (e.g., `npm.cmd run build`, `npx.cmd vite`) to prevent PowerShell script execution policy errors (`PSSecurityException`).

2. **Prefer Node.js Fetch Over Invoke-WebRequest**:
   For testing local HTTP routes or API responses, prefer `node -e "fetch('...').then(...)"` over PowerShell `Invoke-WebRequest` to avoid COM object and IE engine hangs.

3. **Headless Browser Automation Flags**:
   When launching headless Edge or Chrome with custom user data directories, always include `--no-first-run --no-default-browser-check --disable-fre --guest` to bypass first-run sync dialogs.
