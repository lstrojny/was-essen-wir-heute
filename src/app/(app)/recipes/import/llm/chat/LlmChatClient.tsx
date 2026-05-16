'use client'

import { useChat } from '@ai-sdk/react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { DefaultChatTransport } from 'ai'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { synthesizedToFormInitial } from '@/app/(app)/recipes/recipe-form-conversion'
import type { SynthesizedRecipe } from '@/llm/recipe-synthesis'
import type {
    CentralIngredientOption,
    CuisineRow,
    RecipePickerRow,
} from '@/recipes/queries'
import { RecipeForm, type RecipeFormInitial } from '../../../RecipeForm'

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

export function LlmChatClient({
    cuisines,
    centralIngredients,
    componentCandidates,
    activeLanguage,
}: {
    cuisines: CuisineRow[]
    centralIngredients: CentralIngredientOption[]
    componentCandidates: RecipePickerRow[]
    activeLanguage: 'de' | 'en'
}) {
    const t = useTranslations()
    const { messages, sendMessage, status, stop, error } = useChat({
        transport: new DefaultChatTransport({
            api: '/api/recipes/import/chat',
        }),
    })
    const [input, setInput] = useState('')
    const [recipe, setRecipe] = useState<RecipeFormInitial | null>(null)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const saveAbortRef = useRef<AbortController | null>(null)

    function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        const text = input.trim()
        if (!text) return
        sendMessage({ text })
        setInput('')
    }

    async function saveAsRecipe() {
        saveAbortRef.current?.abort()
        const controller = new AbortController()
        saveAbortRef.current = controller
        setSaving(true)
        setSaveError(null)
        try {
            const res = await fetch('/api/recipes/llm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages }),
                signal: controller.signal,
            })
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as {
                    error?: string
                }
                setSaveError(body.error ?? `HTTP ${res.status}`)
                return
            }
            const data = (await res.json()) as { recipe: SynthesizedRecipe }
            setRecipe(synthesizedToFormInitial(data.recipe))
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                return
            }
            setSaveError(err instanceof Error ? err.message : String(err))
        } finally {
            setSaving(false)
            if (saveAbortRef.current === controller) {
                saveAbortRef.current = null
            }
        }
    }

    function cancelSave() {
        saveAbortRef.current?.abort()
    }

    const streaming = status === 'streaming' || status === 'submitted'
    const canSave = messages.length > 0 && !streaming && !saving

    return (
        <Stack spacing={3}>
            <Paper sx={{ p: 3 }} variant="outlined">
                <Stack spacing={2}>
                    {messages.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            {t('recipes.import.chat.placeholder')}
                        </Typography>
                    ) : null}
                    {messages.map((m) => {
                        const isUser = m.role === 'user'
                        return (
                            <Stack
                                key={m.id}
                                spacing={1}
                                sx={{
                                    alignSelf: isUser
                                        ? 'flex-end'
                                        : 'flex-start',
                                    maxWidth: '85%',
                                }}
                            >
                                {m.parts.map((part, idx) => {
                                    if (part.type === 'text') {
                                        return (
                                            <Box
                                                // biome-ignore lint/suspicious/noArrayIndexKey: message parts are append-only and stable
                                                key={`${m.id}-${idx}`}
                                                sx={{
                                                    p: 1.5,
                                                    borderRadius: 1,
                                                    backgroundColor: isUser
                                                        ? 'primary.main'
                                                        : 'action.hover',
                                                    color: isUser
                                                        ? 'primary.contrastText'
                                                        : 'text.primary',
                                                }}
                                            >
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        whiteSpace: 'pre-wrap',
                                                    }}
                                                >
                                                    {part.text}
                                                </Typography>
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
                    <Box
                        component="form"
                        onSubmit={onSubmit}
                        sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}
                    >
                        <TextField
                            fullWidth
                            placeholder={t(
                                'recipes.import.chat.inputPlaceholder',
                            )}
                            multiline
                            maxRows={4}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={streaming}
                        />
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={streaming || input.trim() === ''}
                        >
                            {t('recipes.import.chat.send')}
                        </Button>
                        {streaming ? (
                            <Button
                                onClick={stop}
                                variant="outlined"
                                color="warning"
                            >
                                {t('recipes.import.chat.stop')}
                            </Button>
                        ) : null}
                    </Box>
                </Stack>
            </Paper>

            {messages.length > 0 ? (
                <Stack spacing={1}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            onClick={saveAsRecipe}
                            variant="contained"
                            disabled={!canSave}
                        >
                            {saving
                                ? t('recipes.import.chat.saving')
                                : t('recipes.import.chat.saveRecipe')}
                        </Button>
                        {saving ? (
                            <Button
                                onClick={cancelSave}
                                variant="outlined"
                                color="warning"
                            >
                                {t('recipes.import.chat.cancelSave')}
                            </Button>
                        ) : null}
                    </Box>
                    {saveError ? (
                        <Alert severity="error">
                            {t('errors.llmSynthesisFailed', {
                                detail: saveError,
                            })}
                        </Alert>
                    ) : null}
                </Stack>
            ) : null}

            {recipe ? (
                <Stack spacing={2}>
                    <Typography variant="h6">
                        {t('recipes.import.chat.previewTitle')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('recipes.import.chat.previewIntro')}
                    </Typography>
                    <RecipeForm
                        initialValues={recipe}
                        cuisines={cuisines}
                        centralIngredients={centralIngredients}
                        componentCandidates={componentCandidates}
                        activeLanguage={activeLanguage}
                        rolledUp={null}
                        source="llm-chat"
                    />
                </Stack>
            ) : null}
        </Stack>
    )
}
