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
import type { SynthesizedRecipe } from '@/llm/recipe-synthesis'
import {
    copyRecipeAction,
    createRecipeAction,
    deleteRecipeAction,
    type RecipeFormState,
    updateRecipeAction,
} from '@/recipes/actions'
import type {
    CentralIngredientOption,
    CuisineRow,
    RecipePickerRow,
} from '@/recipes/queries'
import type { RolledUpRecipe } from '@/recipes/rollup'
import {
    isKnownUnit,
    STANDARD_UNIT_OPTIONS,
    type UnitCategory,
    type UnitOption,
} from '@/recipes/units'
import { ComposedView } from './ComposedView'
import {
    type ChangedFields,
    diffFormInitial,
    emptyChangedFields,
    formSnapshotToSynthesized,
    synthesizedToFormInitial,
} from './recipe-form-conversion'
import { useLlmCall } from './use-llm-call'

const initial: RecipeFormState = {}

function formatAmountForInput(n: number): string {
    if (!Number.isFinite(n)) return ''
    const rounded = Math.round(n * 1000) / 1000
    return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

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

export type RecipeFormComponent = {
    childRecipeId: RecipeId
    titleDe: string | null
    titleEn: string | null
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
    formServings: number
    ingredients: RecipeFormIngredient[]
    steps: RecipeFormStep[]
    components: RecipeFormComponent[]
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
    componentCandidates,
    activeLanguage,
    rolledUp,
    source,
}: {
    initialValues: RecipeFormInitial
    cuisines: CuisineRow[]
    centralIngredients: CentralIngredientOption[]
    componentCandidates: RecipePickerRow[]
    activeLanguage: 'de' | 'en'
    rolledUp: RolledUpRecipe | null
    source?: 'manual' | 'spoonacular' | 'llm-chat'
}) {
    const t = useTranslations()
    const router = useRouter()
    const action =
        initialValues.id === null ? createRecipeAction : updateRecipeAction
    const [state, formAction, pending] = useActionState(action, initial)
    const [titleDe, setTitleDe] = useState(initialValues.titleDe)
    const [titleEn, setTitleEn] = useState(initialValues.titleEn)
    const [notesDe, setNotesDe] = useState(initialValues.notesDe)
    const [notesEn, setNotesEn] = useState(initialValues.notesEn)
    const [cuisineKey, setCuisineKey] = useState<string>(
        initialValues.cuisineKey,
    )
    const [activeTimeMinutes, setActiveTimeMinutes] = useState(
        initialValues.activeTimeMinutes,
    )
    const [waitTimeMinutes, setWaitTimeMinutes] = useState(
        initialValues.waitTimeMinutes,
    )
    const [formServings, setFormServingsState] = useState(
        initialValues.formServings,
    )
    const [appliedFormServings, setAppliedFormServings] = useState(
        initialValues.formServings,
    )
    const [ingredients, setIngredients] = useState(initialValues.ingredients)
    const [steps, setSteps] = useState(initialValues.steps)
    const [components, setComponents] = useState(initialValues.components)
    const [changedFields, setChangedFields] = useState<ChangedFields>(
        emptyChangedFields(),
    )
    const llm = useLlmCall()
    const [refinePrompt, setRefinePrompt] = useState('')

    function clearChanged(
        field: keyof Omit<ChangedFields, 'ingredients' | 'steps'>,
    ) {
        if (!changedFields[field]) return
        setChangedFields((prev) => ({ ...prev, [field]: false }))
    }

    function clearChangedIngredient(index: number) {
        if (!changedFields.ingredients.has(index)) return
        setChangedFields((prev) => {
            const next = new Set(prev.ingredients)
            next.delete(index)
            return { ...prev, ingredients: next }
        })
    }

    function clearChangedStep(index: number) {
        if (!changedFields.steps.has(index)) return
        setChangedFields((prev) => {
            const next = new Set(prev.steps)
            next.delete(index)
            return { ...prev, steps: next }
        })
    }

    function applySynthesizedRecipe(synth: SynthesizedRecipe) {
        const previous: RecipeFormInitial = {
            id: initialValues.id,
            titleDe,
            titleEn,
            notesDe,
            notesEn,
            cuisineKey: (cuisineKey || initialValues.cuisineKey) as
                | CuisineKey
                | '',
            activeTimeMinutes,
            waitTimeMinutes,
            formServings,
            ingredients,
            steps,
            components,
        }
        const next = synthesizedToFormInitial(synth)
        setTitleDe(next.titleDe)
        setTitleEn(next.titleEn)
        setNotesDe(next.notesDe)
        setNotesEn(next.notesEn)
        setCuisineKey(next.cuisineKey)
        setActiveTimeMinutes(next.activeTimeMinutes)
        setWaitTimeMinutes(next.waitTimeMinutes)
        setFormServingsState(next.formServings)
        setAppliedFormServings(next.formServings)
        setIngredients(next.ingredients)
        setSteps(next.steps)
        setChangedFields(diffFormInitial(previous, next))
    }

    function applyFormServings() {
        if (formServings <= 0 || formServings === appliedFormServings) return
        const ratio = formServings / appliedFormServings
        setIngredients((prev) =>
            prev.map((row) => {
                const trimmed = row.amount.trim()
                if (trimmed === '') return row
                const n = Number(trimmed.replace(',', '.'))
                if (Number.isNaN(n)) return row
                return { ...row, amount: formatAmountForInput(n * ratio) }
            }),
        )
        setAppliedFormServings(formServings)
    }

    function recipeLabel(row: {
        titleDe: string | null
        titleEn: string | null
    }): string {
        const primary = activeLanguage === 'de' ? row.titleDe : row.titleEn
        const fallback = activeLanguage === 'de' ? row.titleEn : row.titleDe
        return primary ?? fallback ?? t('recipes.unnamed')
    }

    const availableComponents = useMemo(
        () =>
            componentCandidates.filter(
                (c) => !components.some((row) => row.childRecipeId === c.id),
            ),
        [componentCandidates, components],
    )

    function addComponent(row: RecipePickerRow) {
        setComponents([
            ...components,
            {
                childRecipeId: row.id,
                titleDe: row.titleDe,
                titleEn: row.titleEn,
            },
        ])
    }

    function removeComponent(index: number) {
        setComponents(components.filter((_, i) => i !== index))
    }

    function moveComponent(index: number, delta: -1 | 1) {
        const target = index + delta
        if (target < 0 || target >= components.length) return
        const next = components.slice()
        ;[next[index], next[target]] = [next[target], next[index]]
        setComponents(next)
    }

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
        setIngredients((prev) =>
            prev.map((row, i) =>
                i === index ? { ...row, [field]: value } : row,
            ),
        )
        clearChangedIngredient(index)
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
        setSteps((prev) =>
            prev.map((row, i) =>
                i === index ? { ...row, [field]: value } : row,
            ),
        )
        clearChangedStep(index)
    }

    function addStep() {
        setSteps([...steps, { textDe: '', textEn: '' }])
    }

    function removeStep(index: number) {
        setSteps(steps.filter((_, i) => i !== index))
    }

    async function runRefine() {
        const value = refinePrompt.trim()
        if (!value) return
        const snapshot = formSnapshotToSynthesized({
            titleDe,
            titleEn,
            notesDe,
            notesEn,
            cuisineKey,
            activeTimeMinutes,
            waitTimeMinutes,
            formServings,
            ingredients,
            steps,
        })
        const result = await llm.start(value, snapshot)
        if (result) {
            applySynthesizedRecipe(result)
            setRefinePrompt('')
        }
    }

    return (
        <Stack spacing={3}>
            {state.error ? <Alert severity="error">{state.error}</Alert> : null}
            {state.success ? (
                <Alert severity="success">{state.success}</Alert>
            ) : null}

            <Paper sx={{ p: 3 }} variant="outlined">
                <Stack spacing={2}>
                    <Typography variant="h6">
                        {t('recipes.refine.title')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('recipes.refine.intro')}
                    </Typography>
                    {llm.state.error ? (
                        <Alert severity="error">
                            {t('errors.llmSynthesisFailed', {
                                detail: llm.state.error,
                            })}
                        </Alert>
                    ) : null}
                    <TextField
                        placeholder={t('recipes.refine.promptPlaceholder')}
                        multiline
                        minRows={2}
                        value={refinePrompt}
                        onChange={(e) => setRefinePrompt(e.target.value)}
                    />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            onClick={runRefine}
                            variant="outlined"
                            disabled={
                                llm.state.pending || refinePrompt.trim() === ''
                            }
                        >
                            {llm.state.pending
                                ? t('recipes.refine.refining')
                                : t('recipes.refine.refine')}
                        </Button>
                        {llm.state.pending ? (
                            <Button
                                onClick={llm.cancel}
                                variant="outlined"
                                color="warning"
                            >
                                {t('recipes.refine.cancel')}
                            </Button>
                        ) : null}
                    </Box>
                </Stack>
            </Paper>

            <Stack
                spacing={3}
                component="form"
                action={formAction}
                id="recipe-form"
            >
                {initialValues.id !== null ? (
                    <input type="hidden" name="id" value={initialValues.id} />
                ) : null}
                {source && source !== 'manual' ? (
                    <input type="hidden" name="source" value={source} />
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
                            value={titleDe}
                            onChange={(e) => {
                                setTitleDe(e.target.value)
                                clearChanged('titleDe')
                            }}
                            color={
                                changedFields.titleDe ? 'warning' : undefined
                            }
                            focused={changedFields.titleDe || undefined}
                        />
                        <TextField
                            name="titleEn"
                            label={t('recipes.form.titles.en')}
                            value={titleEn}
                            onChange={(e) => {
                                setTitleEn(e.target.value)
                                clearChanged('titleEn')
                            }}
                            color={
                                changedFields.titleEn ? 'warning' : undefined
                            }
                            focused={changedFields.titleEn || undefined}
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
                            value={cuisineKey}
                            onChange={(e) => {
                                setCuisineKey(e.target.value)
                                clearChanged('cuisineKey')
                            }}
                            color={
                                changedFields.cuisineKey ? 'warning' : undefined
                            }
                            focused={changedFields.cuisineKey || undefined}
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
                                value={activeTimeMinutes}
                                onChange={(e) => {
                                    setActiveTimeMinutes(e.target.value)
                                    clearChanged('activeTimeMinutes')
                                }}
                                color={
                                    changedFields.activeTimeMinutes
                                        ? 'warning'
                                        : undefined
                                }
                                focused={
                                    changedFields.activeTimeMinutes || undefined
                                }
                                inputMode="numeric"
                                required
                                sx={{ flex: 1 }}
                            />
                            <TextField
                                name="waitTimeMinutes"
                                label={t(
                                    'recipes.form.classification.waitTime',
                                )}
                                value={waitTimeMinutes}
                                onChange={(e) => {
                                    setWaitTimeMinutes(e.target.value)
                                    clearChanged('waitTimeMinutes')
                                }}
                                color={
                                    changedFields.waitTimeMinutes
                                        ? 'warning'
                                        : undefined
                                }
                                focused={
                                    changedFields.waitTimeMinutes || undefined
                                }
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
                            {t('recipes.form.components.title')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('recipes.form.components.intro')}
                        </Typography>
                        {components.map((row, index) => (
                            <Box
                                key={row.childRecipeId}
                                sx={{
                                    display: 'flex',
                                    gap: 1,
                                    alignItems: 'center',
                                }}
                            >
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ minWidth: 24, textAlign: 'right' }}
                                >
                                    {index + 1}.
                                </Typography>
                                <Typography sx={{ flexGrow: 1 }}>
                                    {recipeLabel(row)}
                                </Typography>
                                <IconButton
                                    onClick={() => moveComponent(index, -1)}
                                    disabled={index === 0}
                                    aria-label={t(
                                        'recipes.form.components.moveUp',
                                    )}
                                    size="small"
                                >
                                    ▲
                                </IconButton>
                                <IconButton
                                    onClick={() => moveComponent(index, 1)}
                                    disabled={index === components.length - 1}
                                    aria-label={t(
                                        'recipes.form.components.moveDown',
                                    )}
                                    size="small"
                                >
                                    ▼
                                </IconButton>
                                <IconButton
                                    onClick={() => removeComponent(index)}
                                    aria-label={t(
                                        'recipes.form.components.remove',
                                    )}
                                >
                                    <DeleteIcon />
                                </IconButton>
                                <input
                                    type="hidden"
                                    name="componentChildId"
                                    value={row.childRecipeId}
                                />
                            </Box>
                        ))}
                        {components.length === 0 ? (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                            >
                                {t('recipes.form.components.empty')}
                            </Typography>
                        ) : null}
                        <Autocomplete<RecipePickerRow, false, false, false>
                            options={availableComponents}
                            value={null}
                            blurOnSelect
                            clearOnBlur
                            onChange={(_, value) => {
                                if (value) addComponent(value)
                            }}
                            getOptionLabel={(option) => recipeLabel(option)}
                            isOptionEqualToValue={(option, value) =>
                                option.id === value.id
                            }
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t(
                                        'recipes.form.components.addLabel',
                                    )}
                                />
                            )}
                        />
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
                            value={notesDe}
                            onChange={(e) => {
                                setNotesDe(e.target.value)
                                clearChanged('notesDe')
                            }}
                            color={
                                changedFields.notesDe ? 'warning' : undefined
                            }
                            focused={changedFields.notesDe || undefined}
                            multiline
                            minRows={2}
                        />
                        <TextField
                            name="notesEn"
                            label={t('recipes.form.notes.en')}
                            value={notesEn}
                            onChange={(e) => {
                                setNotesEn(e.target.value)
                                clearChanged('notesEn')
                            }}
                            color={
                                changedFields.notesEn ? 'warning' : undefined
                            }
                            focused={changedFields.notesEn || undefined}
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
                        <Box
                            sx={{
                                display: 'flex',
                                gap: 1,
                                alignItems: 'center',
                                flexWrap: 'wrap',
                            }}
                        >
                            <Typography variant="body2">
                                {t('recipes.form.ingredients.forServingsLeft')}
                            </Typography>
                            <TextField
                                type="number"
                                size="small"
                                inputMode="numeric"
                                value={formServings}
                                onChange={(e) => {
                                    const next = Number(e.target.value)
                                    if (Number.isFinite(next) && next > 0) {
                                        setFormServingsState(next)
                                    }
                                }}
                                slotProps={{
                                    htmlInput: { min: 1, step: 1 },
                                }}
                                sx={{ width: 80 }}
                            />
                            <Typography variant="body2">
                                {t('recipes.form.ingredients.forServingsRight')}
                            </Typography>
                            <Button
                                onClick={applyFormServings}
                                variant="outlined"
                                size="small"
                                disabled={formServings === appliedFormServings}
                            >
                                {t('recipes.form.ingredients.applyServings')}
                            </Button>
                        </Box>
                        {formServings !== appliedFormServings ? (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                            >
                                {t(
                                    'recipes.form.ingredients.servingsUnapplied',
                                    {
                                        applied: appliedFormServings,
                                    },
                                )}
                            </Typography>
                        ) : null}
                        <input
                            type="hidden"
                            name="formServings"
                            value={formServings}
                        />
                        {ingredients.map((row, index) => {
                            const selectedOption = row.centralIngredientId
                                ? (pickerOptions.find(
                                      (o) => o.id === row.centralIngredientId,
                                  ) ?? null)
                                : null
                            const isChanged =
                                changedFields.ingredients.has(index)
                            return (
                                <Box
                                    // biome-ignore lint/suspicious/noArrayIndexKey: row identity is positional
                                    key={index}
                                    sx={{
                                        display: 'flex',
                                        gap: 1,
                                        alignItems: 'flex-start',
                                        flexWrap: 'wrap',
                                        borderLeft: isChanged ? 3 : 0,
                                        borderColor: 'warning.main',
                                        pl: isChanged ? 1 : 0,
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
                        {steps.map((row, index) => {
                            const isChanged = changedFields.steps.has(index)
                            return (
                                <Box
                                    // biome-ignore lint/suspicious/noArrayIndexKey: row identity is positional
                                    key={index}
                                    sx={{
                                        display: 'flex',
                                        gap: 1,
                                        alignItems: 'flex-start',
                                        borderLeft: isChanged ? 3 : 0,
                                        borderColor: 'warning.main',
                                        pl: isChanged ? 1 : 0,
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
                                        aria-label={t(
                                            'recipes.form.steps.remove',
                                        )}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </Box>
                            )
                        })}
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

            {rolledUp ? (
                <ComposedView
                    recipe={rolledUp}
                    activeLanguage={activeLanguage}
                    formServings={formServings}
                />
            ) : null}
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
    const [state, formAction, pending] = useActionState(
        deleteRecipeAction,
        initial,
    )
    return (
        <Stack spacing={1} sx={{ ml: 'auto', alignItems: 'flex-end' }}>
            <form
                action={formAction}
                onSubmit={(e) => {
                    if (!confirm(t('recipes.form.confirmDelete'))) {
                        e.preventDefault()
                    }
                }}
            >
                <input type="hidden" name="id" value={id} />
                <Button
                    type="submit"
                    color="error"
                    startIcon={<DeleteIcon />}
                    disabled={pending}
                >
                    {t('recipes.form.delete')}
                </Button>
            </form>
            {state.error ? (
                <Alert severity="error" sx={{ maxWidth: 500 }}>
                    {state.error}
                </Alert>
            ) : null}
        </Stack>
    )
}
