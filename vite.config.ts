import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.GLM_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GLM_API_KEY': JSON.stringify(env.GLM_API_KEY),
        'process.env.QWEN_API_KEY': JSON.stringify(env.QWEN_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        proxy: {
          // Proxy for GLM-5 API
          '/api/glm': {
            target: 'https://coding.dashscope.aliyuncs.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/glm/, '/v1'),
            headers: {
              'Origin': 'https://coding.dashscope.aliyuncs.com'
            }
          },
          // Proxy for Qwen Image API
          '/api/qwen': {
            target: 'https://dashscope.aliyuncs.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/qwen/, '/api/v1'),
            headers: {
              'Origin': 'https://dashscope.aliyuncs.com'
            }
          },
          // Proxy for task status polling
          '/api/qwen-task': {
            target: 'https://dashscope.aliyuncs.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/qwen-task/, '/api/v1'),
            headers: {
              'Origin': 'https://dashscope.aliyuncs.com'
            }
          },
          // Proxy for OSS images (dashscope bucket)
          '/api/oss-image': {
            target: 'https://dashscope-7c2c.oss-cn-shanghai.aliyuncs.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/oss-image/, ''),
            headers: {
              'Origin': 'https://dashscope.aliyuncs.com'
            }
          }
        }
      }
    };
});
