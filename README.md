# mioku-service-audio

基于 [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) 的语音合成服务。

## 特性

- 支持 GPT-SoVITS 模型版本：**v2** / **v2 Pro** / **v2 Pro Plus** / **v4**
- 首次启动自动完成：克隆仓库 → 创建 Python 虚拟环境 → 配置 pip 镜像 → 安装依赖 → 选择下载源 → 下载预训练权重 → 启动 GPT-SoVITS API 服务
- 设备自适应：**NVIDIA CUDA** → **Apple Silicon (MPS)** → **CPU (RAM ≥ 8GB)**，否则报错
- 通过 `config.md` 在 WebUI 中可视化切换模型版本、设备、监听端口等
- 国内加速：默认使用 gh-proxy.com 克隆仓库、hf-mirror.com 下载权重、清华 tuna 镜像作为 pip 索引
- 对外暴露 `generateByText({ text, refAudioName })` 同步推理 API，返回 `temp/audio/<name>.wav`

参考音频目录结构：

```
data/mioku-service-audio/reference-audio/
├── narrator/
│   ├── tts_zh_01.wav
│   └── tts_zh_01.txt     ← 提示文本（与 wav 同名）
└── male/
    ├── male_en_01.wav
    └── male_en_01.txt
```

通过 `service.addReferenceAudio({ name, filePath, promptText, lang })` 添加，更简单。

## 依赖

- Python 3.10 - 3.12
- git
- 8GB+ RAM（无 CUDA 时）
- （可选）NVIDIA GPU
- （可选）Apple Silicon (M1 / M2 / M3 / M4)

## API

```ts
import { start } from "mioku";
import "mioku-service-audio";

await start();

const ctx = /* runtime context  */;
const audio = ctx.services?.audio as AudioServiceApi;

// 最简单的调用
const result = await audio.generateByText({
  text: "你好，世界",
  refAudioName: "narrator_zh_01",
});
// result.filePath 位于 temp/audio/<file>.wav
```

### `generateByText(options)`

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `text` | string | 必填 | 待合成文本 |
| `refAudioName` | string | 必填其一 | 已添加的参考音频名 |
| `refAudioPath` | string | 必填其一 | 直接指定 .wav 路径 |
| `promptText` | string | 引用条目 | 提示文本，留空时会从条目读取 |
| `promptLang` | "zh"\|"en"\|"ja"\|"ko"\|"yue" | 引用条目 | 提示文本语言 |
| `textLang` | 同上 | `defaultLang` | 目标文本语言 |
| `textSplitMethod` | string | "cut5" | 文本分段算法 |
| `speedFactor` | number | 1.0 | 语速倍数 |
| `mediaType` | "wav"\|"ogg"\|"aac"\|"raw" | "wav" | 输出格式 |
| `model` | "v2"\|"v2Pro"\|"v2ProPlus"\|"v4" | settings 默认 | 临时切换模型 |
| `streaming` | boolean | false | 流式返回（暂未实现 chunk 输出） |
| `outputDir` | string | `temp/audio` | 输出目录 |
| `fileName` | string | 推导 | 文件名（不含扩展名） |

返回值：

```ts
{
  filePath: string;          // temp/audio/<file>.wav 绝对路径
  fileName: string;          // 实际写入的文件名
  modelUsed: GptSovitsModel;
  text: string;              // 原始文本
  durationMs: number;        // 推理耗时
  inferenceMs: number;       // 同上
}
```

### `addReferenceAudio({ name, filePath, promptText, lang })`

将外部音频文件（例如从 QQ 收下来的 voice 消息）落到 `data/mioku-service-audio/reference-audio/<name>.wav`，并在 `reference-audio.json` 中记录。

### `listReferenceAudios()`

返回所有已添加的参考音频条目（含 promptText、lang、createdAt）。

### `setActiveModel(model)`

切换默认模型版本（写入 GPT-SoVITS 服务权重，下次生成生效）。

### `getStatus() / ready()`

`ready()` 是异步等待首次 bootstrap 完成；`getStatus()` 同步读取当前状态（设备、模型、端口、是否就绪、最近错误等）。```