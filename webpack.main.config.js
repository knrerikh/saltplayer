const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    main: './src/main/main.ts',
    preload: './src/main/preload.ts'
  },
  target: 'electron-main',
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@/main': path.resolve(__dirname, 'src/main'),
      '@/shared': path.resolve(__dirname, 'src/shared')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: /src/,
        use: [{ loader: 'ts-loader', options: { configFile: 'tsconfig.main.json' } }]
      }
    ]
  },
  node: {
    __dirname: false,
    __filename: false
  },
  externals: {
    'ffmpeg-static': 'commonjs ffmpeg-static',
    'ffprobe-static': 'commonjs ffprobe-static',
    'fluent-ffmpeg': 'commonjs fluent-ffmpeg',
  }
};

