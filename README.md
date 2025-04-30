![img](packages/frontend/src/assets/banner.png)

<h3><div align="center">星枢终端 | Nexus Terminal</div>

---

<div align="center">

[![Docker](https://img.shields.io/badge/-Docker-2496ED?style=flat-square&logo=docker&logoColor=white)][docker-url] [![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-4CAF50?style=flat-square)](https://github.com/Heavrnl/nexus-terminal/blob/main/LICENSE)

[docker-url]: https://hub.docker.com/r/heavrnl/nexus-terminal-frontend

</div>



## 📖 概述

**Nexus Terminal** 是一款现代化、功能丰富的 Web 端 SSH / RDP 客户端，致力于提供高度可定制的远程连接体验。

## ✨ 功能特性

*   多标签页管理 SSH 与 SFTP 连接  
*   支持通过 RDP 协议远程访问 Windows 桌面  
*   内置文本编辑器，支持在线编辑远程文件  
*   集成多重登录安全机制，包括人机验证（hCaptcha、Google reCAPTCHA）与双因素认证（2FA）  
*   可自定义界面主题与布局风格  
*   内置简易 Docker 容器管理面板，便于容器运维  
*   支持 IP 白名单与黑名单，异常访问自动封禁  
*   实时通知系统（如登录提醒、异常告警）  
*   操作审计日志，全面记录用户行为与系统变更  


## 📸 截图



|                            登录界面                            |
|:-------------------------------------------------------------:|
| ![image](https://i.111666.best/image/Dgfy0Y9SoqPOquazKszgux.png) |

---

|                            终端界面（Light）                            |
|:-------------------------------------------------------------:|
| ![image](https://i.111666.best/image/9BEiHGtlIBrCY2wMDeon7X.png) |

---

|                            终端界面（Darker）                            |
|:-------------------------------------------------------------:|
| ![image](https://i.111666.best/image/8wdW1ffDRR5TcsHrCeHusc.png) |

---


<!-- |                        终端界面（Light）                        |                        终端界面（Darker）                        |
|:-------------------------------------------------------------:|:-------------------------------------------------------------:|
| ![image](https://i.111666.best/image/9BEiHGtlIBrCY2wMDeon7X.png) | ![image](https://i.111666.best/image/8wdW1ffDRR5TcsHrCeHusc.png) |

--- -->



|                          样式设置                            |                          布局设置                            |                          设置面板                            |
|:-------------------------------------------------------------:|:-------------------------------------------------------------:|:-------------------------------------------------------------:|
| ![image](https://i.111666.best/image/P1RxdXJhY0Q6G6VUm6H5Ws.png) | ![image](https://i.111666.best/image/PLd79JcWkH3WNuSZBuUQHC.png) | ![image](https://i.111666.best/image/ZpLbvsUdrf5IIaEHsBJ2Of.png) |



## 🚀 快速开始

### 1️⃣ 配置环境

新建文件夹
```bash
mkdir ./nexus-terminal && cd ./nexus-terminal
```
下载仓库的 [**docker-compose.yml**](https://raw.githubusercontent.com/Heavrnl/nexus-terminal/refs/heads/main/docker-compose.yml) 和  [**.env**](https://raw.githubusercontent.com/Heavrnl/nexus-terminal/refs/heads/main/.env) 到目录下

```bash
wget https://raw.githubusercontent.com/Heavrnl/nexus-terminal/refs/heads/main/docker-compose.yml -O docker-compose.yml && wget https://raw.githubusercontent.com/Heavrnl/nexus-terminal/refs/heads/main/.env -O .env
```

配置 nginx
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

### 2️⃣ 启动服务

```bash
docker-compose up -d
```

### 3️⃣ 更新
注意：docker-compose 运行不需要拉取仓库源码，除非你打算自己build，否则只需要在项目目录执行以下命令即可更新。
```bash
docker-compose down
```
```bash
docker-compose pull
```
```bash
docker-compose up -d
```
## 📚 使用指南

以下使用指南都是一些隐式操作功能，项目中未明确说明

### 命令输入框组件
1. 当聚焦于此输入源时，可以通过 `Alt + ↑/↓` 切换ssh会话标签 通过 `Alt + ←/→` 切换文本编辑器标签
2. 当在设置界面开启`命令输入同步`后，在此输入的文字都会即时同步到对应同步的输入源，通过`↑/↓`选择同步源的菜单项，并使用`Alt + Enter`使用选中项的指令

### 文件管理器组件
1. 聚焦于文件搜索框的时候可以通过`↑/↓`选择文件
2. 可从浏览器外部拖拽文件/文件夹上传，注意若要上传的文件夹文件较多，建议打包上传，否则大量文件上传会造成浏览器卡死，目前没做相关优化
3. 可以在文件管理器内部拖动文件/文件夹移动到对应的文件夹
4. 可通过`Ctrl/Shift`多选文件
5. 右键菜单项支持复制/粘贴/剪切/删除/重命名/修改权限等常用功能

### 历史命令组件
1. 若历史命令过长显示被截断。可把鼠标移动到上面查看完整指令


### Ctrl + 鼠标滚轮缩放
1. 可作用于终端组件，文件管理器组件，文本编辑器组件

## 注意事项
1. 可在布局内添加两个文件管理器组件（实验性）
2. 布局内添加多个文本编辑器功能尚未实现

## ☕ 捐赠

如果你觉得这个项目对你有帮助，欢迎通过以下方式请我喝杯咖啡：

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/0heavrnl)


## 📄 开源协议

本项目采用 [GPL-3.0](LICENSE) 开源协议，详细信息请参阅 [LICENSE](LICENSE) 文件。
