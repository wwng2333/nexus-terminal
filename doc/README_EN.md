![banner.png](https://lsky.tuyu.me/i/2025/04/30/681209e053db7.png)

---

<div align="center">

[![Docker](https://img.shields.io/badge/-Docker-2496ED?style=flat-square&logo=docker&logoColor=white)][docker-url] [![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-4CAF50?style=flat-square)](https://github.com/Heavrnl/nexus-terminal/blob/main/LICENSE)

[docker-url]: https://hub.docker.com/r/heavrnl/nexus-terminal-frontend

</div>



## 📖 Overview

**Nexus Terminal** is a modern, feature-rich web-based SSH / RDP client dedicated to providing a highly customizable remote connection experience.

## ✨ Features

*   Manage SSH and SFTP connections with multiple tabs
*   Support remote access to Windows desktops via RDP protocol
*   Utilizes Monaco Editor for online file editing
*   Integrated multi-factor login security mechanisms, including human verification (hCaptcha, Google reCAPTCHA) and two-factor authentication (2FA)
*   Highly customizable interface themes and layout styles
*   Built-in simple Docker container management panel for easy container operations
*   Supports IP whitelisting and blacklisting, with automatic banning for abnormal access
*   Notification system (e.g., login reminders, anomaly alerts)
*   Audit logs for comprehensive recording of user behavior and system changes
*   Lightweight Node.js-based backend with low resource consumption


## 📸 Screenshots



|                            Login Interface                            |
|:-------------------------------------------------------------:|
| ![login.png](https://lsky.tuyu.me/i/2025/04/30/681209911d74f.png) |

---

|                            Terminal Interface (Light)                            |
|:-------------------------------------------------------------:|
| ![workspace_light.png](https://lsky.tuyu.me/i/2025/04/30/68120a8dd0489.png) |

---

|                            Terminal Interface (Darker)                            |
|:-------------------------------------------------------------:|
| ![workspace_darker.png](https://lsky.tuyu.me/i/2025/04/30/68120aa275a76.png) |

---

---

|                            RDP                           |
|:-------------------------------------------------------------:|
| ![RDP.png](https://lsky.tuyu.me/i/2025/04/30/68123a318b817.png) |

---



|                          Style Settings                            |                          Layout Settings                            |                          Settings Panel                            |
|:-------------------------------------------------------------:|:-------------------------------------------------------------:|:-------------------------------------------------------------:|
| ![ui.png](https://lsky.tuyu.me/i/2025/04/30/68120acb7a6fb.png) | ![layout.png](https://lsky.tuyu.me/i/2025/04/30/68120ac6d6a51.png) | ![settings.png](https://lsky.tuyu.me/i/2025/04/30/68120ac76bcb8.png) |



## 🚀 Quick Start

### 1️⃣ Configure Environment

Create a new folder
```bash
mkdir ./nexus-terminal && cd ./nexus-terminal
```
Download the repository's [**docker-compose.yml**](https://raw.githubusercontent.com/Heavrnl/nexus-terminal/refs/heads/main/docker-compose.yml) and  [**.env**](https://raw.githubusercontent.com/Heavrnl/nexus-terminal/refs/heads/main/.env) files into the directory

```bash
wget https://raw.githubusercontent.com/Heavrnl/nexus-terminal/refs/heads/main/docker-compose.yml -O docker-compose.yml && wget https://raw.githubusercontent.com/Heavrnl/nexus-terminal/refs/heads/main/.env -O .env
```

Configure nginx
```conf
location / {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Range $http_range;
    proxy_set_header If-Range $http_if_range;
    proxy_redirect off;
    proxy_pass http://127.0.0.1:18111;
}
```

### 2️⃣ Start the Service

```bash
docker-compose up -d
```

### 3️⃣ Update
Note: Running with docker-compose does not require pulling the source code unless you plan to build it yourself. Simply execute the following commands in the project directory to update.
```bash
docker-compose down
```
```bash
docker-compose pull
```
```bash
docker-compose up -d
```
## 📚 Usage Guide

Here are some hidden practical features to help you use Nexus Terminal more efficiently.

### Command Input Component

1.  **Tab Switching**: When the command input box has focus, use `Alt + ↑/↓` to switch between SSH session tabs, and `Alt + ←/→` to switch between text editor tabs.
2.  **Command Sync** (needs to be enabled in settings): When enabled, text entered in the command input box will be synchronized in real-time to the selected target input source. Use the `↑/↓` keys to select menu command items, then press `Alt + Enter` to send the selected command.

### File Manager Component

1.  **Quick File Selection**: When the file search box has focus, you can use the `↑/↓` keys to quickly select files.
2.  **Drag and Drop Upload**: Supports dragging files or folders from outside the browser for uploading. **Note:** When uploading a large number of files or deeply nested folders, it is recommended to compress them first to avoid browser freezes.
3.  **Internal Drag and Drop**: You can directly drag and drop files or folders within the file manager to move them.
4.  **Multiple Selection**: Hold down the `Ctrl` or `Shift` key to select multiple files or folders.
5.  **Context Menu**: Provides common file operations such as copy, paste, cut, delete, rename, and modify permissions.

### Command History Component

1.  **View Full Command**: When a historical command is too long and truncated, hover the mouse over the command to view the complete instruction content.

### General Operations

1.  **Zoom**: In the terminal, file manager, and text editor components, you can use `Ctrl + Mouse Wheel` to zoom.

## ⚠️ Notes

1.  **Dual File Managers**: You can add two file manager components in the layout (experimental feature, may be unstable).
2.  **Multiple Text Editors**: The functionality to add multiple text editors in the same layout has not yet been implemented.


## ☕ Donate

If you find this project helpful, feel free to buy me a coffee through the following ways:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/0heavrnl)


## 📄 License

This project is licensed under the [GPL-3.0](LICENSE) license. See the [LICENSE](LICENSE) file for details.