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

export async function ensureTorchCodec(venv: VenvInfo): Promise<void> {
  const probe = await runCommand(
    venv.pythonBin,
    ["-c", "import torchcodec"],
    { cwd: venv.dir },
  );
  if (probe.code === 0) {
    audioLog.debug("torchcodec 已安装，跳过");
    return;
  }
  audioLog.info(
    "正在安装 torchcodec (torchaudio 2.9+ 内部依赖，否则 TTS 报 TorchCodec is required) ...",
  );
  const install = await runCommand(
    venv.pythonBin,
    ["-m", "pip", "install", "torchcodec"],
    { cwd: venv.dir },
  );
  if (install.code !== 0) {
    throw new Error(
      `torchcodec 安装失败: ${install.stderr.trim() || install.stdout.trim()}`,
    );
  }
  audioLog.info("torchcodec 安装完成");
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
