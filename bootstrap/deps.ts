import { audioLog } from "../utils/log";
import { runCommand } from "mioku";
import type { VenvInfo } from "./venv";

export async function ensurePythonDeps(
  venv: VenvInfo,
  repoDir: string,
): Promise<void> {
  if (await alreadyInstalled(venv)) {
    audioLog.info("检测到 Python 依赖已安装，跳过 pip install");
    return;
  }

  audioLog.info("正在安装 ffmpeg-python ...");
  await pipInstall(venv, ["ffmpeg-python"]);

  audioLog.info("正在安装 extra-req.txt ...");
  await pipInstallRequirements(venv, `${repoDir}/extra-req.txt`, "--no-deps");

  audioLog.info("正在安装 requirements.txt (大约 5-15 分钟) ...");
  await pipInstallRequirements(venv, `${repoDir}/requirements.txt`);

  await markInstalled(venv);
  audioLog.info("Python 依赖安装完成");
}

export async function ensureHuggingfaceHub(venv: VenvInfo): Promise<void> {
  const probe = await runCommand(
    venv.pythonBin,
    ["-c", "import huggingface_hub"],
    { cwd: venv.dir },
  );
  if (probe.code === 0) return;
  audioLog.info("正在安装 huggingface_hub...");
  const install = await runCommand(
    venv.pythonBin,
    ["-m", "pip", "install", "huggingface_hub"],
    { cwd: venv.dir },
  );
  if (install.code !== 0) {
    throw new Error(
      `huggingface_hub 安装失败: ${install.stderr.trim() || install.stdout.trim()}`,
    );
  }
  audioLog.info("huggingface_hub 安装完成");
}

// torchcodec < 0.16 cannot load FFmpeg 9 (libavutil.61), so systems with a
// modern Homebrew FFmpeg would fail at TTS time with "Could not load
// libtorchcodec ... libavutil.60.dylib ... no such file". Pin the minimum
// version that supports FFmpeg 9 and transparently upgrade stale installs.
const TORCHCODEC_MIN_VERSION = "0.16.0";

export async function ensureTorchCodec(venv: VenvInfo): Promise<void> {
  const version = await probeTorchCodecVersion(venv);
  if (version && meetsMinVersion(version, TORCHCODEC_MIN_VERSION)) {
    audioLog.debug(`torchcodec ${version} 已安装，跳过`);
    return;
  }
  if (version) {
    audioLog.warn(
      `检测到 torchcodec ${version} (< ${TORCHCODEC_MIN_VERSION})，正在升级以支持 FFmpeg 9 ...`,
    );
  } else {
    audioLog.info(
      `正在安装 torchcodec>=${TORCHCODEC_MIN_VERSION} (torchaudio 2.9+ 内部依赖，否则 TTS 报 TorchCodec is required) ...`,
    );
  }
  const install = await runCommand(
    venv.pythonBin,
    ["-m", "pip", "install", `torchcodec>=${TORCHCODEC_MIN_VERSION}`],
    { cwd: venv.dir },
  );
  if (install.code !== 0) {
    throw new Error(
      `torchcodec 安装失败: ${install.stderr.trim() || install.stdout.trim()}`,
    );
  }
  audioLog.info("torchcodec 安装完成");
}

async function probeTorchCodecVersion(venv: VenvInfo): Promise<string | null> {
  const probe = await runCommand(
    venv.pythonBin,
    ["-c", "import torchcodec; print(torchcodec.__version__)"],
    { cwd: venv.dir },
  );
  if (probe.code !== 0) return null;
  return probe.stdout.trim() || null;
}

function meetsMinVersion(installed: string, minimum: string): boolean {
  const parse = (v: string): number[] =>
    v
      .split(/[.+-]/)
      .filter((seg) => /^\d+$/.test(seg))
      .map((seg) => Number.parseInt(seg, 10));
  const a = parse(installed);
  const b = parse(minimum);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return true;
}

export async function ensureNltkData(venv: VenvInfo): Promise<void> {
  const probe = await runCommand(
    venv.pythonBin,
    [
      "-c",
      "import nltk; nltk.data.find('taggers/averaged_perceptron_tagger_eng')",
    ],
    { cwd: venv.dir },
  );
  if (probe.code === 0) {
    audioLog.debug("NLTK averaged_perceptron_tagger_eng 已存在，跳过");
    return;
  }
  audioLog.info(
    "正在下载 NLTK averaged_perceptron_tagger_eng (g2p_en 英文分词需要)...",
  );
  const install = await runCommand(
    venv.pythonBin,
    [
      "-m",
      "nltk.downloader",
      "averaged_perceptron_tagger_eng",
      "-d",
      `${venv.dir}/nltk_data`,
    ],
    { cwd: venv.dir },
  );
  if (install.code !== 0) {
    throw new Error(
      `NLTK 资源下载失败: ${install.stderr.trim() || install.stdout.trim()}`,
    );
  }
  audioLog.info("NLTK averaged_perceptron_tagger_eng 下载完成");
}

async function pipInstall(venv: VenvInfo, args: string[]): Promise<void> {
  const res = await runCommand(
    venv.pythonBin,
    ["-m", "pip", "install", ...args],
    {
      cwd: venv.dir,
    },
  );
  if (res.code !== 0) {
    throw new Error(
      `pip install ${args.join(" ")} 失败: ${res.stderr.trim() || res.stdout.trim()}`,
    );
  }
}

async function pipInstallRequirements(
  venv: VenvInfo,
  reqFile: string,
  flag?: "--no-deps" | undefined,
): Promise<void> {
  const args = ["install"];
  if (flag) args.push(flag);
  args.push("-r", reqFile);
  const res = await runCommand(venv.pythonBin, ["-m", "pip", ...args], {
    cwd: venv.dir,
  });
  if (res.code !== 0) {
    throw new Error(
      `pip install -r ${reqFile} 失败: ${res.stderr.trim() || res.stdout.trim()}`,
    );
  }
}

const MARKER_FILENAME = ".deps_installed";

async function alreadyInstalled(venv: VenvInfo): Promise<boolean> {
  const fs = await import("node:fs/promises");
  try {
    await fs.access(`${venv.dir}/${MARKER_FILENAME}`);
    return true;
  } catch {
    return false;
  }
}

async function markInstalled(venv: VenvInfo): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.writeFile(
    `${venv.dir}/${MARKER_FILENAME}`,
    new Date().toISOString(),
  );
}
