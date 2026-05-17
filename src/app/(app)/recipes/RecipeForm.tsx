'use client'

import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useActionState, useCallback, useMemo, useState } from 'react'
import type { CuisineKey, IngredientId, RecipeId } from '@/db/ids'
import {
    copyRecipeAction,
    createRecipeAction,
    deleteRecipeAction,
    type RecipeFormState,
    updateRecipeAction,
} from '@/recipes/actions'
import type {
    CuisineRow,
    IngredientOption,
    RecipePickerRow,
} from '@/recipes/queries'
import type { RolledUpRecipe } from '@/recipes/rollup'
import {
    isKnownUnit,
    STANDARD_UNIT_OPTIONS,
    type UnitCategory,
    type UnitOption,
} from '@/recipes/units'
import { foldForMatch } from '@/ingredients/name-match'
import {
    type RecipeFormPatch,
    type RecipeFormSnapshot,
    useRegisterRecipeBridge,
} from '../FormBridge'
import { ComposedView } from './ComposedView'
import {
    type ChangedFields,
    emptyChangedFields,
} from './recipe-form-conversion'

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
    ingredientId: IngredientId | null
}

export type RecipeFormStep = {
    textDe: string
    textEn: string
}

export type RecipeFormComponent = {
    childRecipeId: RecipeId
    titleDe: string | null
    titleEn: string | null
    totalActiveTimeMinutes: number
    totalWaitTimeMinutes: number
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
    isCompleteMeal: boolean
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
    ingredientOptions,
    componentCandidates,
    activeLanguage,
    rolledUp,
    source,
    sourceIdentifier,
}: {
    initialValues: RecipeFormInitial
    cuisines: CuisineRow[]
    ingredientOptions: IngredientOption[]
    componentCandidates: RecipePickerRow[]
    activeLanguage: 'de' | 'en'
    rolledUp: RolledUpRecipe | null
    source?: 'manual' | 'spoonacular' | 'llm-chat'
    sourceIdentifier?: string
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
    const [isCompleteMeal, setIsCompleteMeal] = useState(
        initialValues.isCompleteMeal,
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

    const snapshot = useMemo<RecipeFormSnapshot>(
        () => ({
            id: initialValues.id,
            titleDe,
            titleEn,
            notesDe,
            notesEn,
            cuisineKey,
            activeTimeMinutes,
            waitTimeMinutes,
            isCompleteMeal,
            ingredients: ingredients.map((ing) => ({
                amount: ing.amount,
                unit: ing.unit,
                name: ing.name,
            })),
            steps: steps.map((s) => ({ textDe: s.textDe, textEn: s.textEn })),
        }),
        [
            initialValues.id,
            titleDe,
            titleEn,
            notesDe,
            notesEn,
            cuisineKey,
            activeTimeMinutes,
            waitTimeMinutes,
            isCompleteMeal,
            ingredients,
            steps,
        ],
    )

    const applyPatch = useCallback(
        (patch: RecipeFormPatch) => {
            const flags: Partial<ChangedFields> = {}
            if (patch.titleDe !== undefined && patch.titleDe !== titleDe) {
                setTitleDe(patch.titleDe)
                flags.titleDe = true
            }
            if (patch.titleEn !== undefined && patch.titleEn !== titleEn) {
                setTitleEn(patch.titleEn)
                flags.titleEn = true
            }
            if (patch.notesDe !== undefined) {
                const s = patch.notesDe ?? ''
                if (s !== notesDe) {
                    setNotesDe(s)
                    flags.notesDe = true
                }
            }
            if (patch.notesEn !== undefined) {
                const s = patch.notesEn ?? ''
                if (s !== notesEn) {
                    setNotesEn(s)
                    flags.notesEn = true
                }
            }
            if (
                patch.cuisineKey !== undefined &&
                patch.cuisineKey !== cuisineKey
            ) {
                setCuisineKey(patch.cuisineKey)
                flags.cuisineKey = true
            }
            if (patch.activeTimeMinutes !== undefined) {
                const s = String(patch.activeTimeMinutes)
                if (s !== activeTimeMinutes) {
                    setActiveTimeMinutes(s)
                    flags.activeTimeMinutes = true
                }
            }
            if (patch.waitTimeMinutes !== undefined) {
                const s =
                    patch.waitTimeMinutes === 0
                        ? ''
                        : String(patch.waitTimeMinutes)
                if (s !== waitTimeMinutes) {
                    setWaitTimeMinutes(s)
                    flags.waitTimeMinutes = true
                }
            }
            if (
                patch.isCompleteMeal !== undefined &&
                patch.isCompleteMeal !== isCompleteMeal
            ) {
                setIsCompleteMeal(patch.isCompleteMeal)
            }
            let nextIngredients: typeof ingredients | null = null
            if (patch.ingredients !== undefined) {
                nextIngredients = patch.ingredients.map((ing) => ({
                    amount:
                        ing.amount === null
                            ? ''
                            : formatAmountForInput(
                                  ing.amount * appliedFormServings,
                              ),
                    unit: ing.unit ?? '',
                    name: ing.name,
                    ingredientId: null,
                }))
                setIngredients(nextIngredients)
            }
            let nextSteps: typeof steps | null = null
            if (patch.steps !== undefined) {
                nextSteps = patch.steps.map((s) => ({
                    textDe: s.textDe ?? '',
                    textEn: s.textEn ?? '',
                }))
                setSteps(nextSteps)
            }
            setChangedFields((prev) => {
                const out: ChangedFields = {
                    ...prev,
                    ...flags,
                    ingredients: new Set(prev.ingredients),
                    steps: new Set(prev.steps),
                }
                if (nextIngredients) {
                    const len = Math.max(
                        nextIngredients.length,
                        ingredients.length,
                    )
                    for (let i = 0; i < len; i++) {
                        const a = ingredients[i]
                        const b = nextIngredients[i]
                        if (
                            !a ||
                            !b ||
                            a.amount !== b.amount ||
                            a.unit !== b.unit ||
                            a.name !== b.name
                        ) {
                            out.ingredients.add(i)
                        }
                    }
                }
                if (nextSteps) {
                    const len = Math.max(nextSteps.length, steps.length)
                    for (let i = 0; i < len; i++) {
                        const a = steps[i]
                        const b = nextSteps[i]
                        if (
                            !a ||
                            !b ||
                            a.textDe !== b.textDe ||
                            a.textEn !== b.textEn
                        ) {
                            out.steps.add(i)
                        }
                    }
                }
                return out
            })
        },
        [
            titleDe,
            titleEn,
            notesDe,
            notesEn,
            cuisineKey,
            activeTimeMinutes,
            waitTimeMinutes,
            isCompleteMeal,
            ingredients,
            steps,
            appliedFormServings,
        ],
    )

    const bridge = useMemo(
        () => ({ snapshot, applyPatch }),
        [snapshot, applyPatch],
    )
    useRegisterRecipeBridge(bridge)

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
                totalActiveTimeMinutes: row.totalActiveTimeMinutes,
                totalWaitTimeMinutes: row.totalWaitTimeMinutes,
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
        return ingredientOptions.map((row) => {
            const primary =
                activeLanguage === 'de' ? row.canonicalDe : row.canonicalEn
            const secondary =
                activeLanguage === 'de' ? row.canonicalEn : row.canonicalDe
            const label = primary ?? secondary ?? t('ingredients.unnamed')
            const haystack = foldForMatch(
                [primary, secondary, ...row.aliases]
                    .filter((s): s is string => Boolean(s))
                    .join(' '),
            )
            return {
                id: row.id,
                label,
                secondary: primary && secondary ? secondary : null,
                haystack,
            }
        })
    }, [ingredientOptions, activeLanguage, t])

    // Folded-name → existing-entry index. Mirrors the auto-link-on-save logic
    // (see findIngredientByName in src/recipes/queries.ts) so the indicator
    // shows the same match the server would compute at save time.
    const matchIndex = useMemo(() => {
        const map = new Map<string, { id: IngredientId; label: string }>()
        for (const row of ingredientOptions) {
            const display =
                activeLanguage === 'de'
                    ? (row.canonicalDe ?? row.canonicalEn)
                    : (row.canonicalEn ?? row.canonicalDe)
            const label = display ?? t('ingredients.unnamed')
            for (const key of [
                row.canonicalDe,
                row.canonicalEn,
                ...row.aliases,
            ]) {
                if (!key) continue
                const folded = foldForMatch(key)
                if (folded && !map.has(folded)) {
                    map.set(folded, { id: row.id, label })
                }
            }
        }
        return map
    }, [ingredientOptions, activeLanguage, t])

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
            { amount: '', unit: '', name: '', ingredientId: null },
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
                {source && source !== 'manual' ? (
                    <input type="hidden" name="source" value={source} />
                ) : null}
                {sourceIdentifier ? (
                    <input
                        type="hidden"
                        name="sourceIdentifier"
                        value={sourceIdentifier}
                    />
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
                        {components.length > 0 ? (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                            >
                                {t(
                                    'recipes.form.classification.totalWithComponents',
                                    {
                                        active:
                                            (Number(activeTimeMinutes) || 0) +
                                            components.reduce(
                                                (sum, c) =>
                                                    sum +
                                                    c.totalActiveTimeMinutes,
                                                0,
                                            ),
                                        wait: Math.max(
                                            Number(waitTimeMinutes) || 0,
                                            ...components.map(
                                                (c) => c.totalWaitTimeMinutes,
                                            ),
                                        ),
                                    },
                                )}
                            </Typography>
                        ) : null}
                        <FormControlLabel
                            control={
                                <Checkbox
                                    name="isCompleteMeal"
                                    checked={isCompleteMeal}
                                    onChange={(e) =>
                                        setIsCompleteMeal(e.target.checked)
                                    }
                                />
                            }
                            label={t(
                                'recipes.form.classification.isCompleteMeal',
                            )}
                        />
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
                            const selectedOption = row.ingredientId
                                ? (pickerOptions.find(
                                      (o) => o.id === row.ingredientId,
                                  ) ?? null)
                                : null
                            const isChanged =
                                changedFields.ingredients.has(index)
                            const trimmedName = row.name.trim()
                            const matchedExisting = row.ingredientId
                                ? (pickerOptions.find(
                                      (o) => o.id === row.ingredientId,
                                  ) ?? null)
                                : trimmedName
                                  ? (matchIndex.get(
                                        foldForMatch(trimmedName),
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
                                                    'ingredientId',
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
                                                    'ingredientId',
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
                                                    'ingredientId',
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
                                                if (row.ingredientId) {
                                                    updateIngredient(
                                                        index,
                                                        'ingredientId',
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
                                            const q = foldForMatch(inputValue)
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
                                        value={row.ingredientId ?? ''}
                                    />
                                    <IconButton
                                        onClick={() => removeIngredient(index)}
                                        aria-label={t(
                                            'recipes.form.ingredients.remove',
                                        )}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                    {trimmedName ? (
                                        <Chip
                                            size="small"
                                            variant="outlined"
                                            color={
                                                matchedExisting
                                                    ? 'success'
                                                    : 'default'
                                            }
                                            label={
                                                matchedExisting
                                                    ? t(
                                                          'recipes.form.ingredients.matchExisting',
                                                          {
                                                              name: matchedExisting.label,
                                                          },
                                                      )
                                                    : t(
                                                          'recipes.form.ingredients.matchNew',
                                                      )
                                            }
                                            sx={{
                                                flexBasis: '100%',
                                                alignSelf: 'flex-start',
                                                width: 'fit-content',
                                            }}
                                        />
                                    ) : null}
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
                    liveTotalActiveMinutes={
                        (Number(activeTimeMinutes) || 0) +
                        components.reduce(
                            (sum, c) => sum + c.totalActiveTimeMinutes,
                            0,
                        )
                    }
                    liveTotalWaitMinutes={Math.max(
                        Number(waitTimeMinutes) || 0,
                        ...components.map((c) => c.totalWaitTimeMinutes),
                        0,
                    )}
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
