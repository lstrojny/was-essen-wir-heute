'use client'

import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useActionState, useMemo, useState } from 'react'
import type { CuisineKey, IngredientId, RecipeId } from '@/db/ids'
import {
    copyRecipeAction,
    createRecipeAction,
    deleteRecipeAction,
    type RecipeFormState,
    updateRecipeAction,
} from '@/recipes/actions'
import type { CentralIngredientOption, CuisineRow } from '@/recipes/queries'
import {
    isKnownUnit,
    STANDARD_UNIT_OPTIONS,
    type UnitCategory,
    type UnitOption,
} from '@/recipes/units'

const initial: RecipeFormState = {}

export type RecipeFormIngredient = {
    amount: string
    unit: string
    name: string
    centralIngredientId: IngredientId | null
}

export type RecipeFormStep = {
    textDe: string
    textEn: string
}

export type RecipeFormInitial = {
    id: RecipeId | null
    titleDe: string
    titleEn: string
    notesDe: string
    notesEn: string
    cuisineKey: CuisineKey | ''
    activeTimeMinutes: string
    waitTimeMinutes: string
    ingredients: RecipeFormIngredient[]
    steps: RecipeFormStep[]
}

type PickerOption = {
    id: IngredientId
    label: string
    secondary: string | null
    haystack: string
}

export function RecipeForm({
    initialValues,
    cuisines,
    centralIngredients,
    activeLanguage,
}: {
    initialValues: RecipeFormInitial
    cuisines: CuisineRow[]
    centralIngredients: CentralIngredientOption[]
    activeLanguage: 'de' | 'en'
}) {
    const t = useTranslations()
    const router = useRouter()
    const action =
        initialValues.id === null ? createRecipeAction : updateRecipeAction
    const [state, formAction, pending] = useActionState(action, initial)
    const [ingredients, setIngredients] = useState(initialValues.ingredients)
    const [steps, setSteps] = useState(initialValues.steps)

    const pickerOptions = useMemo<PickerOption[]>(() => {
        return centralIngredients.map((row) => {
            const primary =
                activeLanguage === 'de' ? row.canonicalDe : row.canonicalEn
            const secondary =
                activeLanguage === 'de' ? row.canonicalEn : row.canonicalDe
            const label = primary ?? secondary ?? t('ingredients.unnamed')
            const haystack = [primary, secondary, ...row.aliases]
                .filter((s): s is string => Boolean(s))
                .join(' ')
                .toLowerCase()
            return {
                id: row.id,
                label,
                secondary: primary && secondary ? secondary : null,
                haystack,
            }
        })
    }, [centralIngredients, activeLanguage, t])

    function updateIngredient<K extends keyof RecipeFormIngredient>(
        index: number,
        field: K,
        value: RecipeFormIngredient[K],
    ) {
        setIngredients(
            ingredients.map((row, i) =>
                i === index ? { ...row, [field]: value } : row,
            ),
        )
    }

    function addIngredient() {
        setIngredients([
            ...ingredients,
            { amount: '', unit: '', name: '', centralIngredientId: null },
        ])
    }

    function removeIngredient(index: number) {
        setIngredients(ingredients.filter((_, i) => i !== index))
    }

    function updateStep(
        index: number,
        field: 'textDe' | 'textEn',
        value: string,
    ) {
        setSteps(
            steps.map((row, i) =>
                i === index ? { ...row, [field]: value } : row,
            ),
        )
    }

    function addStep() {
        setSteps([...steps, { textDe: '', textEn: '' }])
    }

    function removeStep(index: number) {
        setSteps(steps.filter((_, i) => i !== index))
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
                id="recipe-form"
            >
                {initialValues.id !== null ? (
                    <input type="hidden" name="id" value={initialValues.id} />
                ) : null}

                <Paper sx={{ p: 3 }} variant="outlined">
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            {t('recipes.form.titles.title')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('recipes.form.titles.intro')}
                        </Typography>
                        <TextField
                            name="titleDe"
                            label={t('recipes.form.titles.de')}
                            defaultValue={initialValues.titleDe}
                        />
                        <TextField
                            name="titleEn"
                            label={t('recipes.form.titles.en')}
                            defaultValue={initialValues.titleEn}
                        />
                    </Stack>
                </Paper>

                <Paper sx={{ p: 3 }} variant="outlined">
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            {t('recipes.form.classification.title')}
                        </Typography>
                        <TextField
                            name="cuisineKey"
                            label={t('recipes.form.classification.cuisine')}
                            select
                            defaultValue={initialValues.cuisineKey}
                            required
                        >
                            {cuisines.map((c) => (
                                <MenuItem key={c.key} value={c.key}>
                                    {activeLanguage === 'de'
                                        ? c.labelDe
                                        : c.labelEn}
                                </MenuItem>
                            ))}
                        </TextField>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                name="activeTimeMinutes"
                                label={t(
                                    'recipes.form.classification.activeTime',
                                )}
                                defaultValue={initialValues.activeTimeMinutes}
                                inputMode="numeric"
                                required
                                sx={{ flex: 1 }}
                            />
                            <TextField
                                name="waitTimeMinutes"
                                label={t(
                                    'recipes.form.classification.waitTime',
                                )}
                                defaultValue={initialValues.waitTimeMinutes}
                                inputMode="numeric"
                                helperText={t(
                                    'recipes.form.classification.waitTimeHint',
                                )}
                                sx={{ flex: 1 }}
                            />
                        </Box>
                    </Stack>
                </Paper>

                <Paper sx={{ p: 3 }} variant="outlined">
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            {t('recipes.form.notes.title')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('recipes.form.notes.intro')}
                        </Typography>
                        <TextField
                            name="notesDe"
                            label={t('recipes.form.notes.de')}
                            defaultValue={initialValues.notesDe}
                            multiline
                            minRows={2}
                        />
                        <TextField
                            name="notesEn"
                            label={t('recipes.form.notes.en')}
                            defaultValue={initialValues.notesEn}
                            multiline
                            minRows={2}
                        />
                    </Stack>
                </Paper>

                <Paper sx={{ p: 3 }} variant="outlined">
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            {t('recipes.form.ingredients.title')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('recipes.form.ingredients.intro')}
                        </Typography>
                        {ingredients.map((row, index) => {
                            const selectedOption = row.centralIngredientId
                                ? (pickerOptions.find(
                                      (o) => o.id === row.centralIngredientId,
                                  ) ?? null)
                                : null
                            return (
                                <Box
                                    // biome-ignore lint/suspicious/noArrayIndexKey: row identity is positional
                                    key={index}
                                    sx={{
                                        display: 'flex',
                                        gap: 1,
                                        alignItems: 'flex-start',
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <TextField
                                        name="ingredientAmount"
                                        label={t(
                                            'recipes.form.ingredients.amount',
                                        )}
                                        value={row.amount}
                                        onChange={(e) =>
                                            updateIngredient(
                                                index,
                                                'amount',
                                                e.target.value,
                                            )
                                        }
                                        inputMode="decimal"
                                        sx={{ width: 100 }}
                                    />
                                    <UnitPicker
                                        value={row.unit}
                                        onChange={(value) =>
                                            updateIngredient(
                                                index,
                                                'unit',
                                                value,
                                            )
                                        }
                                    />
                                    <Autocomplete<
                                        PickerOption,
                                        false,
                                        false,
                                        true
                                    >
                                        freeSolo
                                        autoSelect
                                        options={pickerOptions}
                                        value={selectedOption ?? row.name}
                                        onChange={(_, value) => {
                                            if (value === null) {
                                                updateIngredient(
                                                    index,
                                                    'name',
                                                    '',
                                                )
                                                updateIngredient(
                                                    index,
                                                    'centralIngredientId',
                                                    null,
                                                )
                                            } else if (
                                                typeof value === 'string'
                                            ) {
                                                updateIngredient(
                                                    index,
                                                    'name',
                                                    value,
                                                )
                                                updateIngredient(
                                                    index,
                                                    'centralIngredientId',
                                                    null,
                                                )
                                            } else {
                                                updateIngredient(
                                                    index,
                                                    'name',
                                                    value.label,
                                                )
                                                updateIngredient(
                                                    index,
                                                    'centralIngredientId',
                                                    value.id,
                                                )
                                            }
                                        }}
                                        onInputChange={(_, value, reason) => {
                                            if (reason === 'input') {
                                                updateIngredient(
                                                    index,
                                                    'name',
                                                    value,
                                                )
                                                if (row.centralIngredientId) {
                                                    updateIngredient(
                                                        index,
                                                        'centralIngredientId',
                                                        null,
                                                    )
                                                }
                                            }
                                        }}
                                        getOptionLabel={(option) =>
                                            typeof option === 'string'
                                                ? option
                                                : option.label
                                        }
                                        isOptionEqualToValue={(option, value) =>
                                            typeof value !== 'string' &&
                                            option.id === value.id
                                        }
                                        filterOptions={(
                                            options,
                                            { inputValue },
                                        ) => {
                                            const q = inputValue
                                                .trim()
                                                .toLowerCase()
                                            if (!q) return options
                                            return options.filter((o) =>
                                                o.haystack.includes(q),
                                            )
                                        }}
                                        renderOption={(props, option) => (
                                            <li {...props} key={option.id}>
                                                <Stack>
                                                    <span>{option.label}</span>
                                                    {option.secondary ? (
                                                        <Typography
                                                            component="span"
                                                            variant="caption"
                                                            color="text.secondary"
                                                        >
                                                            {option.secondary}
                                                        </Typography>
                                                    ) : null}
                                                </Stack>
                                            </li>
                                        )}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label={t(
                                                    'recipes.form.ingredients.name',
                                                )}
                                                name="ingredientName"
                                            />
                                        )}
                                        sx={{
                                            flex: '1 1 240px',
                                            minWidth: 240,
                                        }}
                                    />
                                    <input
                                        type="hidden"
                                        name="ingredientCentralId"
                                        value={row.centralIngredientId ?? ''}
                                    />
                                    <IconButton
                                        onClick={() => removeIngredient(index)}
                                        aria-label={t(
                                            'recipes.form.ingredients.remove',
                                        )}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </Box>
                            )
                        })}
                        <Box>
                            <Button
                                onClick={addIngredient}
                                startIcon={<AddIcon />}
                                variant="outlined"
                            >
                                {t('recipes.form.ingredients.add')}
                            </Button>
                        </Box>
                    </Stack>
                </Paper>

                <Paper sx={{ p: 3 }} variant="outlined">
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            {t('recipes.form.steps.title')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('recipes.form.steps.intro')}
                        </Typography>
                        {steps.map((row, index) => (
                            <Box
                                // biome-ignore lint/suspicious/noArrayIndexKey: row identity is positional
                                key={index}
                                sx={{
                                    display: 'flex',
                                    gap: 1,
                                    alignItems: 'flex-start',
                                }}
                            >
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{
                                        pt: 1.5,
                                        minWidth: 24,
                                        textAlign: 'right',
                                    }}
                                >
                                    {index + 1}.
                                </Typography>
                                <Stack spacing={1} sx={{ flex: 1 }}>
                                    <TextField
                                        name="stepDe"
                                        label={t('recipes.form.steps.de')}
                                        value={row.textDe}
                                        onChange={(e) =>
                                            updateStep(
                                                index,
                                                'textDe',
                                                e.target.value,
                                            )
                                        }
                                        multiline
                                        minRows={1}
                                    />
                                    <TextField
                                        name="stepEn"
                                        label={t('recipes.form.steps.en')}
                                        value={row.textEn}
                                        onChange={(e) =>
                                            updateStep(
                                                index,
                                                'textEn',
                                                e.target.value,
                                            )
                                        }
                                        multiline
                                        minRows={1}
                                    />
                                </Stack>
                                <IconButton
                                    onClick={() => removeStep(index)}
                                    aria-label={t('recipes.form.steps.remove')}
                                >
                                    <DeleteIcon />
                                </IconButton>
                            </Box>
                        ))}
                        <Box>
                            <Button
                                onClick={addStep}
                                startIcon={<AddIcon />}
                                variant="outlined"
                            >
                                {t('recipes.form.steps.add')}
                            </Button>
                        </Box>
                    </Stack>
                </Paper>
            </Stack>

            <Stack direction="row" spacing={2}>
                <Button
                    type="submit"
                    form="recipe-form"
                    variant="contained"
                    disabled={pending}
                >
                    {pending
                        ? t('recipes.form.saving')
                        : initialValues.id === null
                          ? t('recipes.form.saveCreate')
                          : t('recipes.form.saveUpdate')}
                </Button>
                <Button onClick={() => router.push('/recipes')} variant="text">
                    {t('recipes.form.cancel')}
                </Button>
                {initialValues.id !== null ? (
                    <CopyButton id={initialValues.id} />
                ) : null}
                {initialValues.id !== null ? (
                    <DeleteButton id={initialValues.id} />
                ) : null}
            </Stack>
        </Stack>
    )
}

function UnitPicker({
    value,
    onChange,
}: {
    value: string
    onChange: (next: string) => void
}) {
    const t = useTranslations()
    function labelForUnit(unit: string): string {
        if (isKnownUnit(unit)) {
            return t(`recipes.units.labels.${unit}`)
        }
        return unit
    }
    function groupLabel(category: UnitCategory): string {
        return t(`recipes.units.categories.${category}`)
    }
    const selected: UnitOption | string =
        value === ''
            ? ''
            : (STANDARD_UNIT_OPTIONS.find((o) => o.value === value) ?? value)
    return (
        <>
            <Autocomplete<UnitOption, false, false, true>
                freeSolo
                autoSelect
                options={STANDARD_UNIT_OPTIONS}
                value={selected}
                onChange={(_, next) => {
                    if (next === null) {
                        onChange('')
                    } else if (typeof next === 'string') {
                        onChange(next.trim())
                    } else {
                        onChange(next.value)
                    }
                }}
                onInputChange={(_, next, reason) => {
                    if (reason === 'input') {
                        onChange(next)
                    }
                }}
                groupBy={(option) => groupLabel(option.category)}
                getOptionLabel={(option) =>
                    typeof option === 'string'
                        ? labelForUnit(option)
                        : labelForUnit(option.value)
                }
                isOptionEqualToValue={(option, candidate) =>
                    typeof candidate !== 'string' &&
                    option.value === candidate.value
                }
                filterOptions={(options, { inputValue }) => {
                    const q = inputValue.trim().toLowerCase()
                    if (!q) return options
                    return options.filter(
                        (o) =>
                            o.value.toLowerCase().includes(q) ||
                            labelForUnit(o.value).toLowerCase().includes(q),
                    )
                }}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        label={t('recipes.form.ingredients.unit')}
                    />
                )}
                sx={{ width: 140 }}
            />
            <input type="hidden" name="ingredientUnit" value={value} />
        </>
    )
}

function CopyButton({ id }: { id: RecipeId }) {
    const t = useTranslations()
    return (
        <form action={copyRecipeAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="outlined">
                {t('recipes.form.copy')}
            </Button>
        </form>
    )
}

function DeleteButton({ id }: { id: RecipeId }) {
    const t = useTranslations()
    return (
        <form
            action={deleteRecipeAction}
            onSubmit={(e) => {
                if (!confirm(t('recipes.form.confirmDelete'))) {
                    e.preventDefault()
                }
            }}
            style={{ marginLeft: 'auto' }}
        >
            <input type="hidden" name="id" value={id} />
            <Button type="submit" color="error" startIcon={<DeleteIcon />}>
                {t('recipes.form.delete')}
            </Button>
        </form>
    )
}
