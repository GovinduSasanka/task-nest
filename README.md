<div align="center">

<img src=".github/assets/hero.png" width="640" alt="Task Nest — a category, a task list and task details, side by side" />

# 🌱 Task Nest

**A cute, Notion-style task widget that lives on your desktop.**
Free. Self-hosted. Yours to change.

[![Download](https://img.shields.io/github/v/release/GovinduSasanka/task-nest?label=Download&style=for-the-badge&color=5DA271)](../../releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-informational?style=for-the-badge)](#-install)

</div>

---

Task Nest sits quietly on the edge of your screen like a sticky note, not another browser tab you forget about. Pick a category, add a task, click it for the details — that's the whole idea.

## ✨ Why you might like it

- **Lives on your desktop** — opens with Windows, tucks to the side, stays out of your way until you need it
- **Notion-style detail view** — status, due date, time, priority, tags, subtasks and notes for every task
- **Smart sorting** — To do → In progress, high priority first, completed tasks quietly collapse out of the way
- **Categories you control** — add, rename, re-icon, and drag to reorder your lists
- **A different little animated scene every day** — 7 cute footer designs that rotate daily
- **It's just your files** — everything is saved locally to a plain JSON file on your machine, nothing is sent anywhere
- **No account, no sign-up, no subscription** — download it, run it, that's it

## 📸 See it in action

<div align="center">
<img src=".github/assets/hero.png" width="720" alt="Task Nest showing the task list and an open task's details" />
</div>

## ⬇️ Install

**[Download the latest installer](../../releases/latest)** → run `Task-Nest-Setup-x.x.x.exe` → done.

- Installs for your user account (no admin needed)
- Adds a Desktop and Start Menu shortcut
- Starts automatically when Windows starts (toggle any time from the **⋯** menu)
- Windows SmartScreen may warn you because the app isn't code-signed — click **More info → Run anyway**

Currently Windows only. macOS/Linux builds are welcome as a PR — the app is plain Electron, so it should package with minimal changes.

## 🖱️ Using it

| Action | How |
|---|---|
| Switch lists | Click a tab |
| Reorder lists | Drag a tab, or right-click → Move left/right |
| Add a list | Click **+** next to the tabs |
| Add a task | Type in the box and press Enter — try `Gym 6pm` or `Pay rent !high` |
| Open task details | Click a task |
| Change status | Click the status pill, on the task or in its details |
| Reorder tasks | They sort themselves — To do first, then In progress, High priority on top |
| See completed tasks | Click **Completed** at the bottom of a list |
| Move the widget | Drag the top bar |
| Keep it on top of other windows | Click the pin 📌 |
| Show / hide | **Alt + Shift + T**, or click the tray icon |

## 🔒 Your data

Everything is saved to `%APPDATA%\Task Nest\tasknest.json` as you go — nothing leaves your machine.

- A backup is made every time the app starts, plus one per day for the last 7 days, in `%APPDATA%\Task Nest\backups\`
- **⋯** menu → **Open data & backups folder** takes you straight there
- Uninstalling does **not** delete your tasks

## 🛠️ Self-hosting / running from source

Task Nest is just Electron + HTML/CSS/JS — no server, no build step to run it.

```bash
git clone https://github.com/GovinduSasanka/task-nest.git
cd task-nest
npm install
npm start
```

To build your own installer:

```bash
npm run dist        # → dist/Task-Nest-Setup-x.x.x.exe
```

Make it your own — the code is short and readable on purpose. Fork it, re-theme it, add your own footer scenes, rip out anything you don't need.

## 🗺️ Roadmap

- [ ] Mobile app (Android first)
- [ ] Optional cross-device sync
- [ ] An MCP server, so AI assistants (Claude, ChatGPT, etc.) can read and manage your tasks
- [ ] macOS / Linux builds

Have an idea or found a bug? [Open an issue](../../issues).

## 💛 Support

If Task Nest earns a spot on your desktop, a ⭐ on the repo goes a long way — it's the easiest way to help others find it.

## License

[MIT](LICENSE) — do what you like with it, including selling your own fork. Just don't use the name "Task Nest" or its logo for a competing product.

<div align="center">
<sub>Built with 🌱 by <a href="https://github.com/GovinduSasanka">Govindu Sasanka</a></sub>
</div>
