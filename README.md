This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 面试草稿导入

“新增面试”支持粘贴文本或上传 TXT、MD、DOCX、PDF 和常见音频文件。识别结果只会填入表单，用户点击“新建面试”后才会写入数据库。

文本结构化默认采用本地规则，无需 API Key。配置 `OPENAI_API_KEY` 后会自动使用 AI 结构化识别，音频转写目前使用 OpenAI 的转写接口：

```dotenv
OPENAI_API_KEY=your-key

# 可选
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_INTERVIEW_MODEL=gpt-4o-mini
INTERVIEW_STT_PROVIDER=openai
INTERVIEW_STRUCTURE_PROVIDER=auto
```

服务边界位于 `src/lib/interviews/transcription.ts` 和 `src/lib/interviews/draft.ts`。未来接入 whisper.cpp、faster-whisper 或其他 STT 服务时，不需要修改表单和保存流程。

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
