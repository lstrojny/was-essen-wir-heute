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
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
    type KeyboardEvent,
    useActionState,
    useCallback,
    useMemo,
    useState,
} from 'react'
import type { IngredientId } from '@/db/ids'
import {
    type AliasCheckConflict,
    checkAliasAvailableAction,
    createIngredientAction,
    deleteIngredientAction,
    type IngredientFormState,
    updateIngredientAction,
} from '@/ingredients/actions'
import { foldForMatch } from '@/ingredients/name-match'
import {
    type IngredientFormPatch,
    type IngredientFormSnapshot,
    useRegisterIngredientBridge,
} from '../FormBridge'

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

type ChangedIngredientFields = {
    canonicalDe: boolean
    canonicalEn: boolean
    role: boolean
    density: boolean
    notes: boolean
    aliases: boolean
    countUnits: boolean
}

function emptyChanged(): ChangedIngredientFields {
    return {
        canonicalDe: false,
        canonicalEn: false,
        role: false,
        density: false,
        notes: false,
        aliases: false,
        countUnits: false,
    }
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
    const [canonicalDe, setCanonicalDe] = useState(initialValues.canonicalDe)
    const [canonicalEn, setCanonicalEn] = useState(initialValues.canonicalEn)
    const [role, setRole] = useState(initialValues.role)
    const [density, setDensity] = useState(initialValues.density)
    const [notes, setNotes] = useState(initialValues.notes)
    const [aliases, setAliases] = useState<string[]>(initialValues.aliases)
    const [aliasDraft, setAliasDraft] = useState('')
    type AliasError =
        | { kind: 'text'; message: string }
        | { kind: 'conflict'; conflict: AliasCheckConflict }
    const [aliasError, setAliasError] = useState<AliasError | null>(null)
    const [countUnits, setCountUnits] = useState(initialValues.countUnits)
    const [changed, setChanged] = useState<ChangedIngredientFields>(
        emptyChanged(),
    )

    function renderAliasError(err: AliasError | null): React.ReactNode {
        if (!err) return ' '
        if (err.kind === 'text') return err.message
        const { conflict } = err
        if (!conflict.ownerId || !conflict.ownerLabel) {
            // Same-ingredient (canonical) or other case without a target.
            return conflict.reason === 'canonical-on-same-ingredient'
                ? t('errors.aliasEqualsCanonical', { alias: conflict.alias })
                : t('errors.aliasDuplicate', {
                      alias: conflict.alias,
                      owner: conflict.ownerLabel ?? '?',
                  })
        }
        const ownerId = conflict.ownerId
        const ownerLabel = conflict.ownerLabel
        return t.rich('errors.aliasDuplicateRich', {
            alias: conflict.alias,
            owner: ownerLabel,
            link: (chunks) => (
                <Link
                    href={`/ingredients/${ownerId}`}
                    style={{ color: 'inherit', textDecoration: 'underline' }}
                >
                    {chunks}
                </Link>
            ),
        })
    }

    function localAliasError(raw: string): AliasError | null {
        const folded = foldForMatch(raw)
        if (!folded) return null
        if (aliases.some((a) => foldForMatch(a) === folded)) {
            return { kind: 'text', message: t('errors.aliasAlreadyOnList') }
        }
        if (
            (canonicalDe && foldForMatch(canonicalDe) === folded) ||
            (canonicalEn && foldForMatch(canonicalEn) === folded)
        ) {
            return {
                kind: 'text',
                message: t('errors.aliasEqualsCanonical', { alias: raw }),
            }
        }
        return null
    }

    function clearChange(field: keyof ChangedIngredientFields) {
        if (!changed[field]) return
        setChanged((prev) => ({ ...prev, [field]: false }))
    }

    const snapshot = useMemo<IngredientFormSnapshot>(
        () => ({
            id: initialValues.id,
            canonicalDe,
            canonicalEn,
            role,
            density,
            notes,
            aliases,
            countUnits,
        }),
        [
            initialValues.id,
            canonicalDe,
            canonicalEn,
            role,
            density,
            notes,
            aliases,
            countUnits,
        ],
    )

    const applyPatch = useCallback(
        (patch: IngredientFormPatch) => {
            const next = emptyChanged()
            if (
                patch.canonicalDe !== undefined &&
                patch.canonicalDe !== canonicalDe
            ) {
                setCanonicalDe(patch.canonicalDe)
                next.canonicalDe = true
            }
            if (
                patch.canonicalEn !== undefined &&
                patch.canonicalEn !== canonicalEn
            ) {
                setCanonicalEn(patch.canonicalEn)
                next.canonicalEn = true
            }
            if (patch.role !== undefined && patch.role !== role) {
                setRole(patch.role)
                next.role = true
            }
            if (patch.density !== undefined) {
                const asStr =
                    patch.density === null
                        ? ''
                        : String(patch.density).replace('.', ',')
                if (asStr !== density) {
                    setDensity(asStr)
                    next.density = true
                }
            }
            if (patch.notes !== undefined) {
                const asStr = patch.notes ?? ''
                if (asStr !== notes) {
                    setNotes(asStr)
                    next.notes = true
                }
            }
            if (patch.aliases !== undefined) {
                const sameLen = patch.aliases.length === aliases.length
                const sameContent =
                    sameLen && patch.aliases.every((a, i) => a === aliases[i])
                if (!sameContent) {
                    setAliases(patch.aliases)
                    next.aliases = true
                }
            }
            if (patch.countUnits !== undefined) {
                const mapped = patch.countUnits.map((cu) => ({
                    unit: cu.unit,
                    gramsPerUnit: String(cu.gramsPerUnit).replace('.', ','),
                }))
                const sameLen = mapped.length === countUnits.length
                const sameContent =
                    sameLen &&
                    mapped.every(
                        (cu, i) =>
                            cu.unit === countUnits[i]?.unit &&
                            cu.gramsPerUnit === countUnits[i]?.gramsPerUnit,
                    )
                if (!sameContent) {
                    setCountUnits(mapped)
                    next.countUnits = true
                }
            }
            setChanged((prev) => ({
                canonicalDe: prev.canonicalDe || next.canonicalDe,
                canonicalEn: prev.canonicalEn || next.canonicalEn,
                role: prev.role || next.role,
                density: prev.density || next.density,
                notes: prev.notes || next.notes,
                aliases: prev.aliases || next.aliases,
                countUnits: prev.countUnits || next.countUnits,
            }))
        },
        [canonicalDe, canonicalEn, role, density, notes, aliases, countUnits],
    )

    const bridge = useMemo(
        () => ({ snapshot, applyPatch }),
        [snapshot, applyPatch],
    )
    useRegisterIngredientBridge(bridge)

    const [checkingAlias, setCheckingAlias] = useState(false)

    async function addAlias() {
        const v = aliasDraft.trim()
        if (!v) return
        const localError = localAliasError(v)
        if (localError) {
            setAliasError(localError)
            return
        }
        setCheckingAlias(true)
        setAliasError(null)
        try {
            const result = await checkAliasAvailableAction(
                v,
                initialValues.id,
                canonicalDe,
                canonicalEn,
            )
            if (!result.ok) {
                setAliasError({ kind: 'conflict', conflict: result.conflict })
                return
            }
        } catch (err) {
            setAliasError({
                kind: 'text',
                message: err instanceof Error ? err.message : String(err),
            })
            return
        } finally {
            setCheckingAlias(false)
        }
        setAliases([...aliases, v])
        setAliasDraft('')
        setAliasError(null)
        clearChange('aliases')
    }

    function handleAliasKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') {
            e.preventDefault()
            void addAlias()
        }
    }

    function removeAlias(target: string) {
        setAliases(aliases.filter((a) => a !== target))
        setAliasError(null)
        clearChange('aliases')
    }

    function addCountUnit() {
        setCountUnits([...countUnits, { unit: '', gramsPerUnit: '' }])
        clearChange('countUnits')
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
        clearChange('countUnits')
    }

    function removeCountUnit(index: number) {
        setCountUnits(countUnits.filter((_, i) => i !== index))
        clearChange('countUnits')
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
                            value={canonicalDe}
                            onChange={(e) => {
                                setCanonicalDe(e.target.value)
                                clearChange('canonicalDe')
                            }}
                            color={changed.canonicalDe ? 'warning' : undefined}
                            focused={changed.canonicalDe || undefined}
                        />
                        <TextField
                            name="canonicalEn"
                            label={t('ingredients.form.canonical.en')}
                            value={canonicalEn}
                            onChange={(e) => {
                                setCanonicalEn(e.target.value)
                                clearChange('canonicalEn')
                            }}
                            color={changed.canonicalEn ? 'warning' : undefined}
                            focused={changed.canonicalEn || undefined}
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
                            value={role}
                            onChange={(e) => {
                                setRole(
                                    e.target
                                        .value as IngredientFormInitial['role'],
                                )
                                clearChange('role')
                            }}
                            color={changed.role ? 'warning' : undefined}
                            focused={changed.role || undefined}
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
                            value={density}
                            onChange={(e) => {
                                setDensity(e.target.value)
                                clearChange('density')
                            }}
                            color={changed.density ? 'warning' : undefined}
                            focused={changed.density || undefined}
                            helperText={t(
                                'ingredients.form.classification.densityHint',
                            )}
                            inputMode="decimal"
                        />
                        <TextField
                            name="notes"
                            label={t('ingredients.form.classification.notes')}
                            value={notes}
                            onChange={(e) => {
                                setNotes(e.target.value)
                                clearChange('notes')
                            }}
                            color={changed.notes ? 'warning' : undefined}
                            focused={changed.notes || undefined}
                            multiline
                            minRows={2}
                        />
                    </Stack>
                </Paper>

                <Paper
                    sx={{
                        p: 3,
                        borderColor: changed.aliases
                            ? 'warning.main'
                            : undefined,
                    }}
                    variant="outlined"
                >
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
                                onChange={(e) => {
                                    setAliasDraft(e.target.value)
                                    if (aliasError) setAliasError(null)
                                }}
                                onKeyDown={handleAliasKey}
                                error={aliasError !== null}
                                helperText={renderAliasError(aliasError)}
                                slotProps={{
                                    formHelperText: {
                                        component: 'div',
                                    },
                                }}
                                fullWidth
                            />
                            <Button
                                onClick={() => void addAlias()}
                                variant="outlined"
                                disabled={
                                    checkingAlias || aliasDraft.trim() === ''
                                }
                                sx={{ alignSelf: 'flex-start', mt: '8px' }}
                            >
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

                <Paper
                    sx={{
                        p: 3,
                        borderColor: changed.countUnits
                            ? 'warning.main'
                            : undefined,
                    }}
                    variant="outlined"
                >
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
        <Stack
            component="form"
            action={deleteIngredientAction}
            onSubmit={(e) => {
                if (!confirm(t('ingredients.form.confirmDelete'))) {
                    e.preventDefault()
                }
            }}
            direction="row"
            spacing={2}
            sx={{ alignItems: 'center' }}
        >
            <input type="hidden" name="id" value={id} />
            <Button type="submit" color="error" variant="outlined">
                {t('ingredients.form.delete')}
            </Button>
        </Stack>
    )
}
