'use client'

import { useChat } from '@ai-sdk/react'
import SendIcon from '@mui/icons-material/Send'
import StopIcon from '@mui/icons-material/Stop'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { DefaultChatTransport } from 'ai'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { PageContext } from '@/llm/recipe-synthesis'
import {
    type IngredientFormPatch,
    type RecipeFormPatch,
    useFormBridgeApi,
} from './FormBridge'

type ToolPart = {
    type: string
    state?: string
    input?: unknown
    output?: unknown
}

function summarizeToolResult(output: unknown): string | null {
    if (output === null || output === undefined) return null
    if (typeof output !== 'object') return String(output)
    const o = output as Record<string, unknown>
    if (typeof o.error === 'string') return `error: ${o.error}`
    if (typeof o.count === 'number') return `${o.count} result(s)`
    if (o.ok === true) {
        if (typeof o.aggregateAverage === 'number') {
            return `ok · avg ${o.aggregateAverage.toFixed(1)} (${o.aggregateCount})`
        }
        if (o.appliedTo) return `applied to ${o.appliedTo}`
        return 'ok'
    }
    if (Array.isArray(o.cuisines)) return `${o.cuisines.length} cuisines`
    if (typeof o.average === 'number') {
        return `avg ${o.average.toFixed(1)} (${o.count ?? '?'})`
    }
    if (typeof o.id === 'string') return 'fetched'
    return null
}

function ToolCallChip({ part }: { part: ToolPart }) {
    const name = part.type.replace(/^tool-/, '')
    const running =
        part.state === 'partial-call' ||
        part.state === 'call' ||
        part.state === 'input-streaming' ||
        part.state === 'input-available'
    const resultSummary = summarizeToolResult(part.output)
    return (
        <Chip
            size="small"
            variant="outlined"
            icon={
                running ? (
                    <CircularProgress size={12} thickness={6} />
                ) : undefined
            }
            label={resultSummary ? `${name} · ${resultSummary}` : name}
            sx={{ alignSelf: 'flex-start' }}
        />
    )
}

function derivePageContextFromPath(
    pathname: string,
    recipe: unknown,
    ingredient: unknown,
): PageContext {
    if (pathname === '/recipes') return { pageKind: 'recipes-list' }
    if (pathname === '/ingredients') return { pageKind: 'ingredients-list' }
    if (
        recipe &&
        (pathname === '/recipes/new' || /^\/recipes\/[^/]+$/.test(pathname))
    ) {
        return { pageKind: 'recipe-detail', recipe }
    }
    if (
        ingredient &&
        (pathname === '/ingredients/new' ||
            /^\/ingredients\/[^/]+$/.test(pathname))
    ) {
        return { pageKind: 'ingredient-detail', ingredient }
    }
    return { pageKind: 'other', path: pathname }
}

export function ChatSidebar() {
    const t = useTranslations()
    const pathname = usePathname() ?? '/'
    const bridgeApi = useFormBridgeApi()
    const pageContextRef = useRef<PageContext>({ pageKind: 'other' })

    const onToolCall = useCallback(
        async ({
            toolCall,
        }: {
            toolCall: {
                toolName: string
                input: unknown
                addToolResult: (result: unknown) => void
            }
        }) => {
            const store = bridgeApi.getStore()
            if (toolCall.toolName === 'patch_recipe_form') {
                const patch = (
                    toolCall.input as { patch?: RecipeFormPatch } | null
                )?.patch
                if (!patch) {
                    toolCall.addToolResult({ error: 'missing patch' })
                    return
                }
                if (!store.recipe) {
                    toolCall.addToolResult({
                        error: 'no recipe form open on this page',
                    })
                    return
                }
                store.recipe.applyPatch(patch)
                toolCall.addToolResult({ ok: true, appliedTo: 'recipe form' })
                return
            }
            if (toolCall.toolName === 'patch_ingredient_form') {
                const patch = (
                    toolCall.input as { patch?: IngredientFormPatch } | null
                )?.patch
                if (!patch) {
                    toolCall.addToolResult({ error: 'missing patch' })
                    return
                }
                if (!store.ingredient) {
                    toolCall.addToolResult({
                        error: 'no ingredient form open on this page',
                    })
                    return
                }
                store.ingredient.applyPatch(patch)
                toolCall.addToolResult({
                    ok: true,
                    appliedTo: 'ingredient form',
                })
                return
            }
        },
        [bridgeApi],
    )

    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: '/api/recipes/import/chat',
                prepareSendMessagesRequest: ({ messages, body }) => ({
                    body: {
                        messages,
                        pageContext: pageContextRef.current,
                        ...(body ?? {}),
                    },
                }),
            }),
        [],
    )

    const { messages, sendMessage, status, stop, error } = useChat({
        transport,
        // biome-ignore lint/suspicious/noExplicitAny: AI SDK onToolCall signature
        onToolCall: onToolCall as any,
    })

    // Refresh pageContext on every state change so the next sendMessage picks it up
    useEffect(() => {
        const store = bridgeApi.getStore()
        pageContextRef.current = derivePageContextFromPath(
            pathname,
            store.recipe?.snapshot,
            store.ingredient?.snapshot,
        )
    })

    const [input, setInput] = useState('')
    const scrollRef = useRef<HTMLDivElement | null>(null)

    // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages or stream-state change
    useEffect(() => {
        const el = scrollRef.current
        if (el) {
            el.scrollTop = el.scrollHeight
        }
    }, [messages.length, status])

    function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        const text = input.trim()
        if (!text) return
        sendMessage({ text })
        setInput('')
    }

    const streaming = status === 'streaming' || status === 'submitted'

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box
                sx={{
                    px: 2,
                    py: 1.5,
                    borderBottom: 1,
                    borderColor: 'divider',
                }}
            >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {t('chat.title')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    {t('chat.subtitle')}
                </Typography>
            </Box>
            <Box
                ref={scrollRef}
                sx={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    px: 2,
                    py: 1.5,
                }}
            >
                <Stack spacing={1.5}>
                    {messages.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            {t('chat.placeholder')}
                        </Typography>
                    ) : null}
                    {messages.map((m) => {
                        const isUser = m.role === 'user'
                        return (
                            <Stack
                                key={m.id}
                                spacing={0.75}
                                sx={{
                                    alignSelf: isUser
                                        ? 'flex-end'
                                        : 'flex-start',
                                    maxWidth: '95%',
                                }}
                            >
                                {m.parts.map((part, idx) => {
                                    if (part.type === 'text') {
                                        return (
                                            <Box
                                                // biome-ignore lint/suspicious/noArrayIndexKey: message parts are append-only and stable
                                                key={`${m.id}-${idx}`}
                                                sx={{
                                                    px: 1.25,
                                                    py: 0.75,
                                                    borderRadius: 1,
                                                    backgroundColor: isUser
                                                        ? 'primary.main'
                                                        : 'action.hover',
                                                    color: isUser
                                                        ? 'primary.contrastText'
                                                        : 'text.primary',
                                                    fontSize: '0.875rem',
                                                    '& p': { my: 0.5 },
                                                    '& p:first-of-type': {
                                                        mt: 0,
                                                    },
                                                    '& p:last-of-type': {
                                                        mb: 0,
                                                    },
                                                    '& ul, & ol': {
                                                        my: 0.5,
                                                        pl: 2.5,
                                                    },
                                                    '& li': { my: 0.25 },
                                                    '& code': {
                                                        bgcolor: isUser
                                                            ? 'rgba(255,255,255,0.18)'
                                                            : 'rgba(0,0,0,0.08)',
                                                        px: 0.5,
                                                        borderRadius: 0.5,
                                                        fontSize: '0.85em',
                                                    },
                                                    '& pre': {
                                                        bgcolor: isUser
                                                            ? 'rgba(255,255,255,0.18)'
                                                            : 'rgba(0,0,0,0.08)',
                                                        p: 1,
                                                        borderRadius: 1,
                                                        overflowX: 'auto',
                                                        '& code': {
                                                            bgcolor:
                                                                'transparent',
                                                            px: 0,
                                                        },
                                                    },
                                                    '& a': {
                                                        color: 'inherit',
                                                        textDecoration:
                                                            'underline',
                                                    },
                                                }}
                                            >
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                >
                                                    {part.text}
                                                </ReactMarkdown>
                                            </Box>
                                        )
                                    }
                                    if (
                                        typeof part.type === 'string' &&
                                        part.type.startsWith('tool-')
                                    ) {
                                        return (
                                            <ToolCallChip
                                                // biome-ignore lint/suspicious/noArrayIndexKey: message parts are append-only and stable
                                                key={`${m.id}-${idx}`}
                                                part={part}
                                            />
                                        )
                                    }
                                    return null
                                })}
                            </Stack>
                        )
                    })}
                    {error ? (
                        <Alert severity="error">
                            {t('errors.llmSynthesisFailed', {
                                detail: error.message,
                            })}
                        </Alert>
                    ) : null}
                </Stack>
            </Box>
            <Box
                component="form"
                onSubmit={onSubmit}
                sx={{
                    display: 'flex',
                    gap: 0.5,
                    alignItems: 'flex-end',
                    px: 1.5,
                    py: 1.25,
                    borderTop: 1,
                    borderColor: 'divider',
                }}
            >
                <TextField
                    fullWidth
                    size="small"
                    placeholder={t('chat.inputPlaceholder')}
                    multiline
                    maxRows={6}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (
                            e.key === 'Enter' &&
                            !e.shiftKey &&
                            !streaming &&
                            input.trim() !== ''
                        ) {
                            e.preventDefault()
                            onSubmit(e as unknown as React.FormEvent)
                        }
                    }}
                />
                {streaming ? (
                    <IconButton
                        onClick={stop}
                        color="warning"
                        aria-label={t('chat.stop')}
                    >
                        <StopIcon />
                    </IconButton>
                ) : (
                    <IconButton
                        type="submit"
                        color="primary"
                        disabled={input.trim() === ''}
                        aria-label={t('chat.send')}
                    >
                        <SendIcon />
                    </IconButton>
                )}
            </Box>
        </Box>
    )
}
