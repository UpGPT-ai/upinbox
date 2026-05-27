const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const isProd = process.env.NODE_ENV === 'production';

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: isProd ? 'production' : 'development',
  devtool: isProd ? undefined : 'cheap-module-source-map',

  entry: {
    background: './src/background.ts',
    content: './src/content.ts',
    popup: './src/popup.tsx',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },

  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: 'ts-loader',
          options: { configFile: path.resolve(__dirname, 'tsconfig.json') },
        },
        exclude: /node_modules/,
      },
    ],
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'popup.html', to: 'popup.html' },
        // Icons placeholder — replace with real PNGs before publishing
        {
          from: 'icons',
          to: 'icons',
          noErrorOnMissing: true,
        },
      ],
    }),
  ],

  // Ensure background service worker doesn't get bundled with eval
  optimization: {
    minimize: isProd,
  },
};
