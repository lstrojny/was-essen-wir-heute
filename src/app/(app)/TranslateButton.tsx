'use client'

import TranslateIcon from '@mui/icons-material/Translate'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { type Locale, type LocaleMap, SUPPORTED_LOCALES } from '@/i18n/locale'
import {
    type TranslateFieldKind,
    translateFieldAction,
} from '@/llm/translate-action'

const LOCALE_LABELS: Record<Locale, string> = {
    de: 'Deutsch',
    en: 'English',
}

function pickSource(
    value: LocaleMap,
    activeLocale: Locale,
): { locale: Locale; text: string } | null {
    const activeText = value[activeLocale]?.trim()
    if (activeText) {
        return { locale: activeLocale, text: activeText }
    }
    for (const locale of SUPPORTED_LOCALES) {
        const text = value[locale]?.trim()
        if (text) {
            return { locale, text }
        }
    }
    return null
}

export function TranslateButton({
    value,
    activeLocale,
    kind,
    onApply,
    label,
}: {
    value: LocaleMap
    activeLocale: Locale
    kind: TranslateFieldKind
    onApply: (translations: LocaleMap) => void
    label?: string
}) {
    const t = useTranslations('translate')
    const [open, setOpen] = useState(false)
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [sourceLocale, setSourceLocale] = useState<Locale | null>(null)
    const [drafts, setDrafts] = useState<LocaleMap>({})

    async function start() {
        setOpen(true)
        setError(null)
        setDrafts({})
        setSourceLocale(null)
        const source = pickSource(value, activeLocale)
        if (!source) {
            setError(t('emptySource'))
            return
        }
        const targets = SUPPORTED_LOCALES.filter((l) => l !== source.locale)
        if (targets.length === 0) {
            setError(t('noTargets'))
            return
        }
        setSourceLocale(source.locale)
        setPending(true)
        try {
            const result = await translateFieldAction({
                text: source.text,
                sourceLocale: source.locale,
                targetLocales: targets,
                kind,
            })
            if (!result.ok) {
                setError(result.error)
                return
            }
            setDrafts(result.translations)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setPending(false)
        }
    }

    function apply() {
        const out: LocaleMap = {}
        for (const locale of SUPPORTED_LOCALES) {
            const v = drafts[locale]
            if (v && v.trim() !== '') out[locale] = v.trim()
        }
        onApply(out)
        setOpen(false)
        setDrafts({})
        setSourceLocale(null)
        setError(null)
    }

    function discard() {
        setOpen(false)
        setDrafts({})
        setSourceLocale(null)
        setError(null)
    }

    const draftLocales = sourceLocale
        ? SUPPORTED_LOCALES.filter((l) => l !== sourceLocale)
        : []

    return (
        <Box>
            <Tooltip title={t('triggerHint')}>
                <IconButton
                    size="small"
                    onClick={() => void start()}
                    aria-label={label ?? t('trigger')}
                >
                    <TranslateIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            {open ? (
                <Paper
                    variant="outlined"
                    sx={{ mt: 1, p: 2, borderColor: 'info.main' }}
                >
                    <Stack spacing={1.5}>
                        <Typography variant="overline" color="info.main">
                            {sourceLocale
                                ? t('reviewTitleFrom', {
                                      source: LOCALE_LABELS[sourceLocale],
                                  })
                                : t('reviewTitle')}
                        </Typography>
                        {pending ? (
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                }}
                            >
                                <CircularProgress size={16} />
                                <Typography variant="body2">
                                    {t('translating')}
                                </Typography>
                            </Box>
                        ) : null}
                        {error ? (
                            <Alert severity="error">{error}</Alert>
                        ) : null}
                        {!pending && !error
                            ? draftLocales.map((locale) => (
                                  <TextField
                                      key={locale}
                                      label={LOCALE_LABELS[locale]}
                                      value={drafts[locale] ?? ''}
                                      onChange={(e) =>
                                          setDrafts((prev) => ({
                                              ...prev,
                                              [locale]: e.target.value,
                                          }))
                                      }
                                      multiline
                                      minRows={1}
                                      fullWidth
                                      size="small"
                                  />
                              ))
                            : null}
                        <Stack direction="row" spacing={1}>
                            <Button
                                onClick={apply}
                                variant="contained"
                                size="small"
                                disabled={
                                    pending ||
                                    error !== null ||
                                    Object.keys(drafts).length === 0
                                }
                            >
                                {t('apply')}
                            </Button>
                            <Button
                                onClick={discard}
                                variant="text"
                                size="small"
                            >
                                {t('cancel')}
                            </Button>
                        </Stack>
                    </Stack>
                </Paper>
            ) : null}
        </Box>
    )
}
