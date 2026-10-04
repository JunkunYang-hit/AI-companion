# 栖伴 · AI Companion

一个陪你聊天、学习和工作的 Windows 桌面伙伴。

<img src="assets/app-icon.png" width="96" alt="栖伴图标">

桌宠留在桌面上，轻轻回应；需要认真聊时，再打开完整聊天窗口。你决定它是谁、记住什么、多久主动说一句，也随时可以让它安静。

**[下载安装包](https://github.com/JunkunYang-hit/AI-companion/releases/latest)** · [角色使用指南](docs/character-guide.md) · [反馈问题](https://github.com/JunkunYang-hit/AI-companion/issues)

## 有什么特色

- **自己的伙伴**：内置原创小栖、桃桃。可用 PNG、GIF、WebP 添加角色，编辑名字、人格、问候语，导入不同状态的动作。每个角色分别保存聊天和记忆。
- **适度主动陪伴**：主动频率、间隔可以自定义；支持学习时安静陪伴或偶尔提问。勿扰、隐藏、调用次数和费用预算控制后台互动。
- **可管理的记忆**：根据完整会话整理值得记住的内容，也能手动更新、编辑、删除。伙伴主动提出的话题可以接着聊；关闭历史保存时，当前对话仍有临时上下文。
- **资料一起聊**：在聊天中附上文本 PDF、TXT、Markdown；通过可选浏览器扩展手动分享网页和 B 站可见内容。
- **轻一点的桌面体验**：点击人物打开快捷输入，气泡完整分段显示并自动淡出；支持拖动、调整大小和字体，以及樱花粉、晴空蓝、夜色黑主题。
- **自己的模型和密钥**：支持 DeepSeek 等服务及兼容接口。密钥在 Windows 本地加密保存，界面不回显，可以替换或删除；费用记录按返回用量估算。

## 安装：直接使用 Release

适用于 **Windows 10 / 11，64 位**；当前主要在 Windows 11 测试。

1. 打开 [Releases](https://github.com/JunkunYang-hit/AI-companion/releases/latest)。
2. 在 Assets 下载 `AI-Companion-Setup-0.1.7.exe`，运行并按提示安装。
3. 从开始菜单或桌面快捷方式启动 **AI Companion**。

也可以下载 `AI-Companion-0.1.7-windows-x64.zip`，完整解压后双击 `AI Companion.exe`，无需安装。不要只移动其中一个 exe。

安装包尚未购买代码签名证书，Windows 可能提示发布者未知；请仅从本仓库 Release 下载，并与 `SHA256SUMS.txt` 核对。

## 第一次使用

1. 点击桌面人物打开小输入框；双击任务栏通知区图标打开主界面。
2. 在 **模型与费用 → 配置模型** 选择服务、填写模型名称和 API Key。[DeepSeek API 官网](https://platform.deepseek.com/)可创建密钥；网页聊天会员不等于 API 额度。
3. 在 **伙伴设置 → 角色管理** 切换或添加角色，修改人格、问候语和动作。
4. 要让伙伴主动聊天，在主动陪伴设置中开启后台调用并选择频率。先设置适合自己的费用预算；主动陪伴默认关闭。

没有 API Key 也能体验桌宠和角色管理；“离线演示”提供固定测试回复，不是真实 AI。`Ctrl + Alt + H` 隐藏或恢复伙伴；隐藏后的桌面头像也能恢复。关闭主窗口后仍在托盘运行，彻底退出请使用托盘菜单。

## 安装：从源码运行

准备 **Git、Node.js 24 LTS（自带 npm）**，在 PowerShell 中执行：

```powershell
git clone https://github.com/JunkunYang-hit/AI-companion.git
cd AI-companion
npm.cmd ci
npm.cmd start
```

启动后仍在软件界面配置 API Key，**不要把密钥写入源码或提交到 Git**。首次安装依赖需要联网；如使用代理，请先在终端配置好代理。

自行生成 Windows 安装包：

```powershell
npm.cmd run dist:win
```

产物位于 `release`。开发验证可运行 `npm.cmd run typecheck`、`npm.cmd test` 和 `npm.cmd run test:desktop`。浏览器集成测试另外需要 `npx.cmd playwright install chromium`。源码运行不需要 Python 虚拟环境。

## 资料、费用和隐私

- 对话、记忆、设置保存在本机；模型收到你发送的聊天和已授权的资料。API 调用由所选供应商收费，主动聊天和记忆整理也会消耗额度。软件显示估算费用，实际扣费以供应商为准。
- PDF 仅支持可提取文字的文件，没有扫描件 OCR。支持范围和分享方式见[浏览器扩展指南](docs/browser-extension.md)。
- 当前不提供自动截图、摄像头、麦克风、语音或控制电脑。角色图片用于本地外观，不会自动发送给聊天模型。
- 可在软件中导出本机数据备份，备份不包含 API Key。

## 许可与素材

内置角色 **小栖、桃桃**及软件图标为项目原创。自行导入的图片、动图请确认具有相应使用权。

原创代码、角色和图标采用 [MIT](LICENSE)；依赖保留各自许可证，见 [NOTICE](NOTICE.md)。当前为早期版本，欢迎通过 Issues 提供使用反馈。
