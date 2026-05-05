import clipboardy from 'clipboardy';
import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { PASTE_PAUSE_MS, PASTE_RESTORE_DELAY_MS } from './config';

const execAsync = promisify(exec);

/** 平台相关的粘贴按键序列 */
async function pressPaste(): Promise<void> {
  const os = platform();

  if (os === 'darwin') {
    // macOS: 使用 osascript 模拟 Cmd+V
    await execAsync(
      'osascript -e \'tell application "System Events" to keystroke "v" using command down\'',
    );
  } else if (os === 'win32') {
    // Windows: 使用 PowerShell SendKeys 模拟 Ctrl+V
    // 注意: SendKeys 不适用于 UWP/管理员权限应用
    await execAsync(
      'powershell -NoProfile -Command '
        + '"Add-Type -AssemblyName System.Windows.Forms; '
        + '[System.Windows.Forms.SendKeys]::SendWait(\'^v\')"',
    );
  } else {
    // Linux (X11): 使用 xdotool 模拟 Ctrl+V
    await execAsync('xdotool key ctrl+v');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 执行粘贴并恢复剪贴板。
 *
 * 流程:
 * 1. 保存当前剪贴板内容
 * 2. 将目标文本写入剪贴板
 * 3. 模拟 Ctrl+V / Cmd+V 粘贴
 * 4. 等待粘贴完成
 * 5. 恢复原始剪贴板内容
 *
 * @param text 要粘贴的文字
 */
export async function doPasteAndRestore(text: string): Promise<void> {
  let original = '';

  try {
    original = await clipboardy.read();
  } catch {
    // 首次读取可能因无剪贴板内容而失败，不阻塞流程
  }

  try {
    await clipboardy.write(text);
  } catch (err) {
    throw new Error(`写入剪贴板失败: ${(err as Error).message}`);
  }

  try {
    await sleep(PASTE_PAUSE_MS);

    await pressPaste();

    await sleep(PASTE_RESTORE_DELAY_MS);
  } finally {
    // 无论粘贴是否成功，都恢复原始剪贴板
    try {
      if (original) {
        await clipboardy.write(original);
      }
    } catch (err) {
      console.error('[粘贴] 恢复剪贴板失败:', (err as Error).message);
    }
  }
}
