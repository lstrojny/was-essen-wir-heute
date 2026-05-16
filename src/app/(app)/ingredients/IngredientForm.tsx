'use client'

import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { type KeyboardEvent, useActionState, useState } from 'react'
import type { IngredientId } from '@/db/ids'
import {
    createIngredientAction,
    deleteIngredientAction,
    type IngredientFormState,
    updateIngredientAction,
} from '@/ingredients/actions'

const initial: IngredientFormState = {}

export type IngredientFormInitial = {
    id: IngredientId | null
    canonicalDe: string
    canonicalEn: string
    role: 'starch' | 'vegetable' | 'protein' | 'none'
    density: string
    notes: string
    aliases: string[]
    countUnits: Array<{ unit: string; gramsPerUnit: string }>
}

export function IngredientForm({
    initialValues,
}: {
    initialValues: IngredientFormInitial
}) {
    const t = useTranslations()
    const router = useRouter()
    const action =
        initialValues.id === null
            ? createIngredientAction
            : updateIngredientAction
    const [state, formAction, pending] = useActionState(action, initial)
    const [aliases, setAliases] = useState<string[]>(initialValues.aliases)
    const [aliasDraft, setAliasDraft] = useState('')
    const [countUnits, setCountUnits] = useState(initialValues.countUnits)

    function addAlias() {
        const v = aliasDraft.trim()
        if (!v) {
            return
        }
        if (aliases.some((a) => a.toLowerCase() === v.toLowerCase())) {
            setAliasDraft('')
            return
        }
        setAliases([...aliases, v])
        setAliasDraft('')
    }

    function handleAliasKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            addAlias()
        }
    }

    function removeAlias(target: string) {
        setAliases(aliases.filter((a) => a !== target))
    }

    function addCountUnit() {
        setCountUnits([...countUnits, { unit: '', gramsPerUnit: '' }])
    }

    function updateCountUnit(
        index: number,
        field: 'unit' | 'gramsPerUnit',
        value: string,
    ) {
        setCountUnits(
            countUnits.map((cu, i) =>
                i === index ? { ...cu, [field]: value } : cu,
            ),
        )
    }

    function removeCountUnit(index: number) {
        setCountUnits(countUnits.filter((_, i) => i !== index))
    }

    return (
        <Stack spacing={3}>
            {state.error ? <Alert severity="error">{state.error}</Alert> : null}
            {state.success ? (
                <Alert severity="success">{state.success}</Alert>
            ) : null}
            <Stack
                spacing={3}
                component="form"
                action={formAction}
                id="ingredient-form"
            >
                {initialValues.id !== null ? (
                    <input type="hidden" name="id" value={initialValues.id} />
                ) : null}

                <Paper sx={{ p: 3 }} variant="outlined">
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            {t('ingredients.form.canonical.title')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('ingredients.form.canonical.intro')}
                        </Typography>
                        <TextField
                            name="canonicalDe"
                            label={t('ingredients.form.canonical.de')}
                            defaultValue={initialValues.canonicalDe}
                        />
                        <TextField
                            name="canonicalEn"
                            label={t('ingredients.form.canonical.en')}
                            defaultValue={initialValues.canonicalEn}
                        />
                    </Stack>
                </Paper>

                <Paper sx={{ p: 3 }} variant="outlined">
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            {t('ingredients.form.classification.title')}
                        </Typography>
                        <TextField
                            name="role"
                            label={t('ingredients.form.classification.role')}
                            select
                            defaultValue={initialValues.role}
                            required
                        >
                            <MenuItem value="starch">
                                {t('ingredientRoles.starch')}
                            </MenuItem>
                            <MenuItem value="vegetable">
                                {t('ingredientRoles.vegetable')}
                            </MenuItem>
                            <MenuItem value="protein">
                                {t('ingredientRoles.protein')}
                            </MenuItem>
                            <MenuItem value="none">
                                {t('ingredientRoles.none')}
                            </MenuItem>
                        </TextField>
                        <TextField
                            name="density"
                            label={t('ingredients.form.classification.density')}
                            defaultValue={initialValues.density}
                            helperText={t(
                                'ingredients.form.classification.densityHint',
                            )}
                            inputMode="decimal"
                        />
                        <TextField
                            name="notes"
                            label={t('ingredients.form.classification.notes')}
                            defaultValue={initialValues.notes}
                            multiline
                            minRows={2}
                        />
                    </Stack>
                </Paper>

                <Paper sx={{ p: 3 }} variant="outlined">
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            {t('ingredients.form.aliases.title')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('ingredients.form.aliases.intro')}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {aliases.map((alias) => (
                                <Chip
                                    key={alias}
                                    label={alias}
                                    onDelete={() => removeAlias(alias)}
                                />
                            ))}
                            {aliases.length === 0 ? (
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                >
                                    {t('ingredients.form.aliases.empty')}
                                </Typography>
                            ) : null}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField
                                label={t('ingredients.form.aliases.addLabel')}
                                value={aliasDraft}
                                onChange={(e) => setAliasDraft(e.target.value)}
                                onKeyDown={handleAliasKey}
                                fullWidth
                            />
                            <Button onClick={addAlias} variant="outlined">
                                {t('ingredients.form.aliases.add')}
                            </Button>
                        </Box>
                        {aliases.map((alias) => (
                            <input
                                key={alias}
                                type="hidden"
                                name="alias"
                                value={alias}
                            />
                        ))}
                    </Stack>
                </Paper>

                <Paper sx={{ p: 3 }} variant="outlined">
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            {t('ingredients.form.countUnits.title')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('ingredients.form.countUnits.intro')}
                        </Typography>
                        {countUnits.map((cu, index) => (
                            <Box
                                // biome-ignore lint/suspicious/noArrayIndexKey: row identity is positional
                                key={index}
                                sx={{
                                    display: 'flex',
                                    gap: 1,
                                    alignItems: 'center',
                                }}
                            >
                                <TextField
                                    name="countUnitName"
                                    label={t(
                                        'ingredients.form.countUnits.unit',
                                    )}
                                    placeholder={t(
                                        'ingredients.form.countUnits.unitPlaceholder',
                                    )}
                                    value={cu.unit}
                                    onChange={(e) =>
                                        updateCountUnit(
                                            index,
                                            'unit',
                                            e.target.value,
                                        )
                                    }
                                    sx={{ flexGrow: 1 }}
                                />
                                <TextField
                                    name="countUnitGrams"
                                    label={t(
                                        'ingredients.form.countUnits.gramsPerUnit',
                                    )}
                                    value={cu.gramsPerUnit}
                                    onChange={(e) =>
                                        updateCountUnit(
                                            index,
                                            'gramsPerUnit',
                                            e.target.value,
                                        )
                                    }
                                    inputMode="decimal"
                                    sx={{ width: 140 }}
                                />
                                <IconButton
                                    onClick={() => removeCountUnit(index)}
                                    aria-label={t(
                                        'ingredients.form.countUnits.remove',
                                    )}
                                >
                                    <DeleteIcon />
                                </IconButton>
                            </Box>
                        ))}
                        <Box>
                            <Button
                                onClick={addCountUnit}
                                startIcon={<AddIcon />}
                                variant="outlined"
                            >
                                {t('ingredients.form.countUnits.add')}
                            </Button>
                        </Box>
                    </Stack>
                </Paper>
            </Stack>
            <Stack direction="row" spacing={2}>
                <Button
                    type="submit"
                    form="ingredient-form"
                    variant="contained"
                    disabled={pending}
                >
                    {pending
                        ? t('ingredients.form.saving')
                        : initialValues.id === null
                          ? t('ingredients.form.saveCreate')
                          : t('ingredients.form.saveUpdate')}
                </Button>
                <Button
                    onClick={() => router.push('/ingredients')}
                    variant="text"
                >
                    {t('ingredients.form.cancel')}
                </Button>
                {initialValues.id !== null ? (
                    <DeleteButton id={initialValues.id} />
                ) : null}
            </Stack>
        </Stack>
    )
}

function DeleteButton({ id }: { id: IngredientId }) {
    const t = useTranslations()
    return (
        <form
            action={deleteIngredientAction}
            onSubmit={(e) => {
                if (!confirm(t('ingredients.form.confirmDelete'))) {
                    e.preventDefault()
                }
            }}
            style={{ marginLeft: 'auto' }}
        >
            <input type="hidden" name="id" value={id} />
            <Button type="submit" color="error" startIcon={<DeleteIcon />}>
                {t('ingredients.form.delete')}
            </Button>
        </form>
    )
}
