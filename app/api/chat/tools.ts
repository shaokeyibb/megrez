import 'server-only';

import { tool } from 'ai';
import { readdir, readFile, writeFile, unlink, rename, mkdir } from 'fs/promises';
import { glob } from 'glob';
import { z } from 'zod';
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { generateText, Experimental_Agent as Agent, stepCountIs } from 'ai';

const authropic = createAnthropic({
    baseURL: "https://api.openai-proxy.org/anthropic/v1",
});

const pendingAuthenticityVerifications: ({
    id: string;
    answer: {
        confidence: number;
        reason: string;
        answer: string;
    };
} | {
    id: string;
    error: string;
})[] = [];

export { pendingAuthenticityVerifications };

// Memory tool
export const memoryTool = anthropic.tools.memory_20250818({
    execute: async (action) => {
        const memoryDir = './generated';

        if (!existsSync(memoryDir)) {
            await mkdir(memoryDir, { recursive: true });
        }

        switch (action.command) {
            case 'view': {
                const filePath = join(memoryDir, action.path);
                const content = await readFile(filePath, 'utf8');

                if (action.view_range) {
                    const [startLine, endLine] = action.view_range;
                    const lines = content.split('\n');
                    return lines.slice(startLine - 1, endLine).join('\n');
                }

                return content;
            }

            case 'create': {
                const filePath = join(memoryDir, action.path);
                const dir = dirname(filePath);

                if (!existsSync(dir)) {
                    await mkdir(dir, { recursive: true });
                }

                await writeFile(filePath, action.file_text, 'utf8');
                return `File created: ${action.path}`;
            }

            case 'str_replace': {
                const filePath = join(memoryDir, action.path);
                const content = await readFile(filePath, 'utf8');

                if (!content.includes(action.old_str)) {
                    throw new Error(`String not found in file: ${action.path}`);
                }

                const newContent = content.replace(action.old_str, action.new_str);
                await writeFile(filePath, newContent, 'utf8');
                return `String replaced in file: ${action.path}`;
            }

            case 'insert': {
                const filePath = join(memoryDir, action.path);
                const content = await readFile(filePath, 'utf8');
                const lines = content.split('\n');

                const insertLine = Math.max(0, Math.min(action.insert_line - 1, lines.length));

                lines.splice(insertLine, 0, action.insert_text);
                await writeFile(filePath, lines.join('\n'), 'utf8');
                return `Text inserted at line ${action.insert_line} in file: ${action.path}`;
            }

            case 'delete': {
                const filePath = join(memoryDir, action.path);
                await unlink(filePath);
                return `File deleted: ${action.path}`;
            }

            case 'rename': {
                const oldPath = join(memoryDir, action.old_path);
                const newPath = join(memoryDir, action.new_path);
                const newDir = dirname(newPath);

                if (!existsSync(newDir)) {
                    await mkdir(newDir, { recursive: true });
                }

                await rename(oldPath, newPath);
                return `File renamed from ${action.old_path} to ${action.new_path}`;
            }

            default:
                const _exhaustive: never = action;
                throw new Error(`Unknown command: ${_exhaustive}`);
        }
    },
});

// File search tool
export const fileSearchTool = tool({
    description: `Search for files in the workspace by glob pattern. This only returns the paths of matching files. Use this tool when you know the exact filename pattern of the files you're searching for. Glob patterns match from the root of the workspace folder. Examples:
        - **/*.{js,ts} to match all js/ts files in the workspace.
        - src/** to match all files under the top-level src folder.
        - **/foo/**/*.js to match all js files under any foo folder in the workspace.`,
    inputSchema: z.object({
        pattern: z.string().describe('The glob pattern to search for.'),
    }),
    outputSchema: z.array(z.string().describe('The paths of the matching files.')),
    execute: async ({ pattern }) => {
        const files = await glob(pattern, { root: './context' });
        return files;
    }
});

// Grep search tool
export const grepSearchTool = tool({
    description: `Do a text search in the workspace. Use this tool when you know the exact string you're searching for.`,
    inputSchema: z.object({
        query: z.string().describe('The text query to search for. Might be a regex.'),
        beforeContext: z.number().describe('The number of lines to include before the matching lines.').optional(),
        afterContext: z.number().describe('The number of lines to include after the matching lines.').optional(),
    }),
    outputSchema: z.object({
        files: z.array(z.object({
            file: z.string().describe('The path to the file that contains the match.'),
            content: z.string().describe('The content of the file that contains the match.'),
        })),
    }),
    execute: async ({ query, beforeContext, afterContext }) => {
        const files = await glob('**/*.md', { root: './context' });
        const contents = await Promise.all(files.map(async (file) => {
            const content = (await readFile(file, 'utf8'))
            const matches = content.matchAll(new RegExp(query));
            const beforeContextLines = matches.map(match => match.index - (beforeContext ?? 0));
            const afterContextLines = matches.map(match => match.index + (afterContext ?? 0));
            return {
                file,
                content: [...beforeContextLines, ...matches.map(match => match[0]), ...afterContextLines].join('\n'),
            };
        }));
        return {
            files: contents.map(content => ({
                file: content.file,
                content: content.content,
            })),
        };
    },
});

// Read file tool
export const readFileTool = tool({
    description: `Read the contents of a file. You must specify the line range you're interested in, and if the file is larger, you will be given an outline of the rest of the file. If the file contents returned are insufficient for your task, you may call this tool again to retrieve more content.`,
    inputSchema: z.object({
        path: z.string().describe('The path to the file to read.'),
        startLine: z.number().describe('The line number to start reading from. If not provided, the first line will be used.').optional(),
        endLine: z.number().describe('The line number to stop reading at. If not provided, the last line will be used.').optional(),
    }),
    outputSchema: z.string().describe('The contents of the file.'),
    execute: async ({ path, startLine, endLine }) => {
        startLine = startLine ?? 1;

        const filePath = join('./context', path);
        const content = await readFile(filePath, 'utf8');
        return content.split('\n').slice(startLine - 1, endLine).join('\n');
    }
});

// List directory tool
export const listDirTool = tool({
    description: `List the contents of a directory. Result will have the name of the child. If the name ends in /, it's a folder, otherwise a file.`,
    inputSchema: z.object({
        path: z.string().describe('The path to the directory to list.'),
    }),
    outputSchema: z.array(z.string().describe('The paths of the children of the directory.')),
    execute: async ({ path }) => {
        const dirPath = join('./context', path);
        const files = await readdir(dirPath, { withFileTypes: true });
        return files.map(file => file.isDirectory() ? `${file.name}/` : file.name);
    }
});

// Read PDF tool
export const readPdfTool = tool({
    description: `Read the contents of a PDF file.`,
    inputSchema: z.object({
        path: z.string().describe('The path to the PDF file to read.'),
    }),
    outputSchema: z.string().describe('The contents of the PDF file.'),
    execute: async ({ path }) => {
        const result = await generateText({
            model: authropic('claude-haiku-4-5'),
            system: `Read the contents of the PDF gives to you, Organize and convert it to markdown format.`,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'file',
                            data: await readFile(join('./context', path), 'base64'),
                            mediaType: 'application/pdf',
                        },
                    ]
                }
            ]
        });
        return result.text;
    }
});

// Authenticity verification tool
export const doAuthenticityVerificationOnBackgroundTool = tool({
    description: `Check the accuracy of the interviewee's answers or to retrieve additional information behind the scenes, you will get an unique id as output, the result will be returned after a few seconds.`,
    inputSchema: z.object({
        question: z.string().describe('The question to check the authenticity of.'),
    }),
    outputSchema: z.string().describe('The unique id of the authenticity verification.'),
    execute: async ({ question }) => {
        const id = randomUUID();

        new Agent({
            model: authropic('claude-haiku-4-5'),
            system: `You're a senior authenticity checker AI, you're in a interview, check the accuracy of the question the interviewer gives to you, and output the answer in JSON format.
                 The answer must be in the following JSON format: { confidence: number, reason: string, answer: string }. The confidence should be between 0 and 1. The reason should be a short explanation of the answer. The answer should be the answer to the question. If you can't find the answer, make confidence -1. The JSON must be valid and well-formed.
                 You can use the web_search and web_fetch tools to search the internet for the answer.
                 Here's an example of the answer and the question:
                 <example>
                    <question>What is the capital of France?</question>
                    <answer>{ "confidence": 1, "reason": "The capital of France is Paris.", "answer": "Paris" }</answer>
                 </example>
                 `,
            tools: {
                web_search: anthropic.tools.webSearch_20250305({ maxUses: 1 }),
                web_fetch: anthropic.tools.webFetch_20250910({ maxUses: 1 }),
            },
            stopWhen: stepCountIs(3),
        }).generate({
            prompt: `${question}
            Now, find out the answer and give me the answer in JSON format directly. Don't include any other text in your response. Don't include markdown code block in your response.` }).then(result => result.text).then(answer => {
                console.log("Authenticity verification result: ", answer);
                const structuredAnswer = JSON.parse(answer) as { confidence: number; reason: string; answer: string };
                pendingAuthenticityVerifications.push({ id, answer: structuredAnswer });
            }).catch(error => {
                console.log("Authenticity verification error: ", error);
                console.log("Request Body: ", JSON.stringify({ error }, null, 2));
                pendingAuthenticityVerifications.push({ id, error: error instanceof Error ? error.message : String(error) });
            });

        return id;
    }
});

// Evaluate interview tool
export const evaluateInterviewTool = tool({
    description: `Evaluate the interview and pass the interview results.`,
    inputSchema: z.object({
        interviewResults: z.string().describe('The interview results to evaluate.'),
    }),
    outputSchema: z.string().describe('The evaluation of the interview.'),
    execute: async ({ interviewResults }) => {
        console.log("Interview results: ", interviewResults);
        return interviewResults;
    }
});

// Export all tools as an object
export const interviewTools = {
    memory: memoryTool,
    file_search: fileSearchTool,
    grep_search: grepSearchTool,
    read_file: readFileTool,
    list_dir: listDirTool,
    read_pdf: readPdfTool,
    do_authenticity_verification_on_background: doAuthenticityVerificationOnBackgroundTool,
    evaluate_interview: evaluateInterviewTool,
    web_search: anthropic.tools.webSearch_20250305(),
    web_fetch: anthropic.tools.webFetch_20250910(),
};


