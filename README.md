# Global Meeting Coach

一个面向 Global Medical / BD Meeting 的本地训练应用。目标是把真实会议材料转化为：

- 无字幕实时听力
- 立场 / 依据 / 风险 / 行动提取
- 10–20 秒句块训练
- 90 → 60 → 45 秒限时表达
- 临场追问
- 两个月进度记录

## 在线地址

GitHub Pages：<https://350166654lq-droid.github.io/global-meeting-coach/>

在 iPhone Safari 打开后，点“分享”→“添加到主屏幕”。每日任务更新后，重新打开或刷新 App 即可读取最新内容。

本机的发布监听器会监测 `data/daily-session.json`。文件通过结构校验且内容发生变化时，只提交这一个 JSON 并推送 `main`；GitHub Pages 随后自动发布。发布日志写入 `/tmp/global-meeting-coach-publish.log` 和 `/tmp/global-meeting-coach-publish-error.log`。

## 启动

直接双击桌面上的 `Global Meeting Coach.app`。也可以双击本目录内的 `launch.command`。浏览器会打开 `http://127.0.0.1:4173`。

首次录音时，浏览器会请求麦克风权限。训练记录保存在浏览器本地；清除该网站数据会删除记录。

## 每日内容

默认从 `data/daily-session.json` 读取当天训练。也可以在应用内导入 JSON 或临时打开自己的音视频。

若曾导入任务而希望恢复自动每日任务，点击页面顶部的“恢复自动任务”。该操作只清除导入任务，不会删除训练进度、文字记录或录音。

## iPhone 使用

应用已支持 iPhone Safari 的 standalone PWA：用 HTTPS 地址在 Safari 打开后，点“分享”→“添加到主屏幕”。移动端使用底部导航；“训练素材”页提供“恢复自动任务”，不需要桌面版顶部按钮。

完整功能（特别是麦克风录音）需要 HTTPS。当前 Mac 本地地址 `127.0.0.1` 只能在 Mac 自己访问；同一 Wi-Fi 的 HTTP 局域网地址只适合预览，不支持 iPhone 录音或可靠的 PWA 安装。部署此静态目录到任一 HTTPS 静态站点后，iPhone 可完整使用。iPhone 的进度、草稿和录音保存在该手机浏览器本地，不会自动同步到 Mac。

每天 08:00 的 Codex 训练任务会核验公开材料，并自动更新这个 JSON。若当天来源无法核验，任务会保留上一版而不是编造内容。

## 隐私

- 默认没有服务器端账户。
- 分数和文字记录使用 localStorage。
- 录音使用浏览器 IndexedDB。
- 不要导入含患者身份信息的会议材料。
