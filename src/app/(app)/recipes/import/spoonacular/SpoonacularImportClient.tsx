'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useActionState } from 'react'
import {
    importSpoonacularAction,
    type SpoonacularImportState,
    type SpoonacularSearchState,
    searchSpoonacularAction,
} from '@/recipes/spoonacular-actions'

const searchInitial: SpoonacularSearchState = {}
const importInitial: SpoonacularImportState = {}

export function SpoonacularImportClient() {
    const t = useTranslations()
    const [searchState, searchAction, searchPending] = useActionState(
        searchSpoonacularAction,
        searchInitial,
    )
    const [importState, importAction, importPending] = useActionState(
        importSpoonacularAction,
        importInitial,
    )

    return (
        <Stack spacing={3}>
            {importState.error ? (
                <Alert severity="error">{importState.error}</Alert>
            ) : null}

            <Paper sx={{ p: 3 }} variant="outlined">
                <Stack spacing={2} component="form" action={searchAction}>
                    <Typography variant="h6">
                        {t('recipes.import.spoonacular.searchTitle')}
                    </Typography>
                    {searchState.error ? (
                        <Alert severity="error">{searchState.error}</Alert>
                    ) : null}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                            name="query"
                            placeholder={t(
                                'recipes.import.spoonacular.searchPlaceholder',
                            )}
                            defaultValue={searchState.query ?? ''}
                            fullWidth
                            required
                        />
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={searchPending}
                        >
                            {searchPending
                                ? t('recipes.import.spoonacular.searching')
                                : t('recipes.import.spoonacular.search')}
                        </Button>
                    </Box>
                </Stack>
            </Paper>

            {searchState.results && searchState.results.length > 0 ? (
                <Stack spacing={1}>
                    {searchState.results.map((hit) => (
                        <Paper
                            key={hit.id}
                            sx={{
                                p: 2,
                                display: 'flex',
                                gap: 2,
                                alignItems: 'center',
                            }}
                            variant="outlined"
                        >
                            {hit.image ? (
                                <Image
                                    src={hit.image}
                                    alt=""
                                    width={64}
                                    height={64}
                                    style={{
                                        objectFit: 'cover',
                                        borderRadius: 4,
                                    }}
                                    unoptimized
                                />
                            ) : null}
                            <Typography sx={{ flexGrow: 1 }}>
                                {hit.title}
                            </Typography>
                            <form action={importAction}>
                                <input type="hidden" name="id" value={hit.id} />
                                <Button
                                    type="submit"
                                    variant="outlined"
                                    disabled={importPending}
                                >
                                    {importPending
                                        ? t(
                                              'recipes.import.spoonacular.importing',
                                          )
                                        : t(
                                              'recipes.import.spoonacular.importThis',
                                          )}
                                </Button>
                            </form>
                        </Paper>
                    ))}
                </Stack>
            ) : null}

            <Paper sx={{ p: 3 }} variant="outlined">
                <Stack spacing={2} component="form" action={importAction}>
                    <Typography variant="h6">
                        {t('recipes.import.spoonacular.pasteTitle')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('recipes.import.spoonacular.pasteIntro')}
                    </Typography>
                    <TextField
                        name="url"
                        placeholder={t(
                            'recipes.import.spoonacular.pastePlaceholder',
                        )}
                        fullWidth
                    />
                    <Box>
                        <Button
                            type="submit"
                            variant="outlined"
                            disabled={importPending}
                        >
                            {importPending
                                ? t('recipes.import.spoonacular.importing')
                                : t('recipes.import.spoonacular.importPaste')}
                        </Button>
                    </Box>
                </Stack>
            </Paper>
        </Stack>
    )
}
