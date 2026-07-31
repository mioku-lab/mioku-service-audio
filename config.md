---
title: 音频合成服务配置
description: 控制 GPT-SoVITS 启动行为、模型选择、设备与推理默认值
fields:
  - key: settings.model
    label: 默认模型版本
    type: select
    description: GPT-SoVITS 模型版本，切换后下次推理生效（无需重启服务）
    options:
      - value: v2
        label: v2
      - value: v2Pro
        label: v2 Pro
      - value: v2ProPlus
        label: v2 Pro Plus (推荐)
      - value: v4
        label: v4
    default: v2

  - key: settings.device
    label: 推理设备
    type: select
    description: auto 会自动选择 cuda → mps → cpu；手动指定则固定使用
    options:
      - value: auto
        label: auto (自动)
      - value: cuda
        label: cuda (NVIDIA)
      - value: mps
        label: mps (Apple Silicon)
      - value: cpu
        label: cpu
    default: auto

  - key: settings.host
    label: 监听地址
    type: text
    description: GPT-SoVITS API 监听地址，默认 127.0.0.1，仅本机访问
    placeholder: 127.0.0.1

  - key: settings.port
    label: 监听端口
    type: number
    description: GPT-SoVITS API 监听端口，默认 9881，避免与其它服务冲突
    placeholder: "9881"

  - key: settings.pythonVersion
    label: Python 版本
    type: select
    description: 创建虚拟环境时使用的 Python 版本，必须 3.10 / 3.11 / 3.12（GPT-SoVITS 的 x_transformers 等依赖依赖 3.10+ PEP 604 语法）
    options:
      - value: "3.10"
        label: "3.10 (推荐)"
      - value: "3.11"
        label: "3.11"
      - value: "3.12"
        label: "3.12"
    default: "3.10"

  - key: settings.pipIndexUrl
    label: pip 索引 URL
    type: text
    description: pip install 时使用的镜像源
    placeholder: https://pypi.tuna.tsinghua.edu.cn/simple

  - key: settings.hfMirror
    label: HuggingFace 镜像
    type: text
    description: 下载预训练权重的 HuggingFace 镜像源，建议使用国内加速
    placeholder: https://hf-mirror.com

  - key: settings.gitRemote
    label: GPT-SoVITS Git 仓库
    type: text
    description: 首次启动时会克隆该仓库；建议使用国内加速代理
    placeholder: https://gh-proxy.com/https://github.com/RVC-Boss/GPT-SoVITS.git

  - key: settings.defaultLang
    label: 默认文本语言
    type: select
    description: generateByText 未指定 lang 时使用的默认语言
    options:
      - value: zh
        label: 中文
      - value: en
        label: 英文
      - value: ja
        label: 日语
      - value: ko
        label: 韩语
      - value: yue
        label: 粤语
    default: zh

  - key: settings.defaultTextSplitMethod
    label: 默认文本切分方法
    type: select
    description: GPT-SoVITS 文本分段算法，详见 GPT_SoVITS/text_segmentation_method.py
    options:
      - value: cut5
        label: cut5
      - value: cut4
        label: cut4
      - value: english_cut2
        label: english_cut2
      - value: japan_cut3
        label: japan_cut3
    default: cut5

  - key: settings.isHalf
    label: 半精度推理
    type: boolean
    description: 在 CUDA 上可降低显存占用；CPU/MPS 自动关闭
    default: true

  - key: settings.inferenceTimeoutMs
    label: 单次推理超时 (ms)
    type: number
    description: 同步模式下最长等待时间
    default: 120000

  - key: settings.defaultRefAudio
    label: 默认参考音频名称
    type: text
    description: |
      generateByText 未指定 refAudioName/refAudioPath 时使用的默认参考音频。
      填写已通过 service.addReferenceAudio 注册的名称（例如 narrator_zh_01），
      留空则 generateByText 每次必须显式传入参考音频。
    placeholder: narrator_zh_01
