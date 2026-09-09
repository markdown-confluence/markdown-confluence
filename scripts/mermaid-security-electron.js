// Disposable privileged host exercises the same @electron/remote bridge used
// by Obsidian. The actual diagram windows must still be fully sandboxed.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const requireRemote = createRequire(import.meta.url);
const remoteMain = requireRemote(MERMAID_REMOTE_MAIN);
remoteMain.initialize();
// CI and disposable macOS sessions may not expose a Metal device.
app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});
async function runElectronChecks() {
	await app.whenReady();
	const host = new BrowserWindow({
		show: false,
		webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
	});
	remoteMain.enable(host.webContents);
	try {
		await host.loadURL(
			"data:text/html,<meta http-equiv='Content-Security-Policy' content=\"default-src 'none'\">Disposable test host",
		);
		const hostModule = fileURLToPath(
			new URL(/* @vite-ignore */ "./remote-host.cjs", import.meta.url),
		);
		const markerUrl = new URL(/* @vite-ignore */ "./outside-root-marker.png", import.meta.url)
			.href;
		const evidence = await host.webContents.executeJavaScript(
			`require(${JSON.stringify(hostModule)}).runRemoteHostChecks(${JSON.stringify(markerUrl)})`,
		);
		if (BrowserWindow.getAllWindows().length !== 1)
			throw new Error("Mermaid windows leaked after capture");
		console.log(
			JSON.stringify({
				runtime: `Electron ${app.getVersion()} through @electron/remote`,
				...evidence,
			}),
		);
		host.close();
		app.exit(0);
	} catch (error) {
		console.error(error);
		host.close();
		app.exit(1);
	}
}
void runElectronChecks();
