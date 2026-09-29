# FlowHMR project page

**FlowHMR: Physically Plausible Motion Capture from Video**

视频背景首屏与白底论文正文，适用于 `https://flowhmr.github.io/`。这是纯静态网站，无需 npm 安装、打包或后端。字体、视频与图片均保存在本地，不依赖外部 CDN。

## 文件结构

```text
flowhmr.github.io/
├── index.html               # 标题、TL;DR、摘要、方法、结果图与定性对比
├── .nojekyll                # GitHub Pages 直接发布静态文件
└── assets/
    ├── css/style.css        # 白底、墨色与蓝绿色主题，响应式布局
    ├── js/main.js           # 视频、导航和论文图表放大交互
    ├── fonts/              # Inter 字体及 OFL 授权文本
    └── media/
        ├── hero-loop.mp4    # 用户选定的第 8–30 秒，22 秒静音循环背景
        ├── hero-poster.jpg
        ├── flowhmr-demo.mp4 # 完整 82.9 秒视频，保留原画质与音轨
        ├── demo-poster.jpg
        ├── comparison-1.mp4 # 俯卧撑对比，1920×1080 / 30 fps
        ├── comparison-1-poster.jpg
        ├── comparison-2.mp4 # 足球踢球对比，1920×1080 / 30 fps
        ├── comparison-2-poster.jpg
        ├── pipeline.webp   # 页面使用的高清压缩图
        ├── pipeline.png    # 放大图
        ├── pipeline.pdf    # 用户提供的原始 PDF
        ├── results-comparison.webp # 结果图，3800×1468 无损压缩
        ├── results-comparison.png  # 结果图高清放大版本
        └── results-comparison.pdf  # 用户提供的原始结果 PDF
```

## 发布到 flowhmr.github.io

1. 用 **flowhmr** GitHub 账号创建 **Public** 仓库，名字必须是 **flowhmr.github.io**。
2. 将本目录的**内容**放到仓库根目录，确保根目录直接有 `index.html`，而不是再嵌套一层文件夹。
3. 建议使用 Git 或 GitHub Desktop 上传。视频约 35 MB，超过 GitHub 网页单文件上传的 25 MiB 限制，但低于普通 Git 的 100 MiB 文件限制，无需 Git LFS。参见 [GitHub 文件大小说明](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。
4. 在仓库 **Settings → Pages** 中，将 **Source** 设为 **Deploy from a branch**，选择 **main** 和 **/ (root)**，保存。
5. **Custom domain 留空**，无需创建 CNAME 文件。部署成功后访问 `https://flowhmr.github.io/`。

若远端仓库是新建的空仓库，可在本目录执行：

```bash
git init -b main
git add .
git commit -m "Add FlowHMR project page"
git remote add origin https://github.com/flowhmr/flowhmr.github.io.git
git push -u origin main
```

如果仓库已有文件，请先克隆仓库，再将这些网页文件复制进去并提交；不要强制推送覆盖已有内容。

## 本地预览

可以直接打开 `index.html`。如需通过本地服务器检查完整视频播放与拖动，可在本目录运行：

```bash
npx --yes http-server . -p 8080 -c-1
```

随后访问 `http://localhost:8080/`。该命令仅用于本地预览；GitHub Pages 无需 Node.js。

## 后续更新

- 文案：编辑 `index.html`。摘要仅按段落排版，保留原文。
- 作者与机构：按用户要求暂不显示，确认后可加入标题下方。
- Code：已链接到 https://github.com/flowhmr/flowhmr，并在新标签页打开。
- Paper：暂时保留 **Coming soon**。论文链接公开后，将对应 `<button>` 改为带 `href` 的 `<a class="resource-button">`，去除 `disabled`、Coming soon 标签和旧 `aria-label`。
- 视频：替换 `assets/media/flowhmr-demo.mp4`。推荐 H.264 / AAC MP4，保留 faststart 以便网页播放。
- Pipeline：替换 `pipeline.webp`、`pipeline.png` 和 `pipeline.pdf`，并同步图片的 `width`、`height` 和替代文字。
- 配色：编辑 CSS 开头的 `:root` 变量。

首屏背景使用原视频第 8–30 秒（22 秒），转为 1280×720、24 fps、H.264 静音循环视频，并提供播放/暂停按钮。背景在离开首屏、切换浏览器标签或播放完整视频时自动暂停，尊重系统“减少动态效果”设置。下方保留完整 82.9 秒视频，由读者点击播放，提供原生暂停、进度、音量及全屏控件。Pipeline 支持点击放大、Esc 关闭和直接查看原始 PDF。

视频首屏参考 [WorldPlay2](https://worldplay2.github.io/)，论文内容结构参考 [Kimodo](https://research.nvidia.com/labs/sil/projects/kimodo/)。页面独立实现，仅使用用户提供的视频与图示，未复制参考站点的媒体或标识。

## Qualitative Comparisons

定性对比区有 **Push-up** 和 **Soccer kick** 两个切换按钮。首次滚动到此区域时，默认片段静音循环播放；切换会暂停上一段。播放器保留暂停、进度与全屏控件。两个按钮支持左右方向键、Home/End 切换，手机布局会自适应。开启系统“减少动态效果”时不自动播放。

素材来自用户指定的 `6a6beec14b880bf42b4068387de37374_crf22_80MB.mp4` 第 **5291–5860 帧**，按 1-based 帧号、30 fps 解释：

- Push-up：5291–5564 帧（274 帧，9.133 秒）。
- Soccer kick：5565–5860 帧（296 帧，9.867 秒）。

分界位于原视频两段之间的淡出/淡入处。完整保留指定帧范围、各方法名称和画面标注，未裁剪比较画面；移除音轨以便网页静音循环。

## Quantitative Results on Wild-4K

结果图位于 Method 和 Qualitative Comparisons 之间，导航 Results 跳转到此处。图示 Wild-4K 数据集上的人类偏好和固定 PHC+ 控制器下的跟踪成功率，保持原始数据、标签、图例与配色。点击可放大，支持 Esc 关闭；页面不显示结果图的 PDF 链接。更新时替换 `results-comparison.webp`、`results-comparison.png`、`results-comparison.pdf`，同步图片尺寸和替代文字。
