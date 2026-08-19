const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

/** @type {import('webpack').Configuration} */
module.exports = (env, argv) => {
  const isDevelopment = argv.mode === 'development';

  return {
    // 多入口：background, popup, options
    entry: {
      background: './src/background.ts',
      popup: './src/popup.ts',
      options: './src/options.ts',
    },

    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },

    // source map：开发模式使用 inline-source-map，生产模式使用 source-map
    devtool: isDevelopment ? 'inline-source-map' : 'source-map',

    resolve: {
      extensions: ['.ts', '.js'],
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'tsconfig.json'),
              // 跳过类型检查以加速构建（类型检查由 tsc 单独执行）
              transpileOnly: false,
            },
          },
          exclude: /node_modules/,
        },
      ],
    },

    plugins: [
      new CopyPlugin({
        patterns: [
          // 复制 manifest.json
          {
            from: path.resolve(__dirname, '../manifest.json'),
            to: 'manifest.json',
          },
          // 复制 HTML 文件
          {
            from: path.resolve(__dirname, '../popup.html'),
            to: 'popup.html',
          },
          {
            from: path.resolve(__dirname, '../options.html'),
            to: 'options.html',
          },
          // 复制 CSS 文件
          {
            from: path.resolve(__dirname, '../popup.css'),
            to: 'popup.css',
          },
          {
            from: path.resolve(__dirname, '../options.css'),
            to: 'options.css',
          },
          // 复制 icons 目录（过滤 placeholder 文件）
          {
            from: path.resolve(__dirname, '../icons'),
            to: 'icons',
            globOptions: {
              ignore: ['**/placeholder.txt'],
            },
            noErrorOnMissing: true,
          },
        ],
      }),
    ],

    // 性能优化：支持 tree-shaking，bundle 目标 < 500KB
    optimization: {
      usedExports: true,        // 标记未使用的导出（tree-shaking 基础）
      sideEffects: true,        // 允许移除无副作用的模块
      minimize: !isDevelopment, // 生产模式启用压缩
    },

    // 性能提示：超过 500KB 时发出警告
    performance: {
      hints: isDevelopment ? false : 'warning',
      maxEntrypointSize: 512000,   // 500KB
      maxAssetSize: 512000,        // 500KB
    },

    // Chrome 扩展运行环境
    target: 'web',
  };
};
