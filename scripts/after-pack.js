const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const sign = (target, extraArgs = []) =>
  execFileSync('codesign', ['--force', ...extraArgs, '--sign', '-', target], { stdio: 'inherit' });

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    context.packager.appInfo.productFilename + '.app'
  );

  // The bundled ffmpeg and ffprobe are signed one by one first: Apple Silicon refuses
  // to run an unsigned binary, and a bundle-wide signature should not be the only
  // thing standing between the app and a "killed: 9" on the first video.
  const ffmpegDir = path.join(appPath, 'Contents', 'Resources', 'ffmpeg');
  for (const name of fs.readdirSync(ffmpegDir)) {
    console.log(`Ad-hoc signing: ${name}`);
    sign(path.join(ffmpegDir, name));
  }

  console.log(`Ad-hoc signing: ${appPath}`);
  sign(appPath, ['--deep']);
};
