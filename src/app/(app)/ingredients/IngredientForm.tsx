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
                        <Typography variant="h6">Canonical names</Typography>
                        <Typography variant="body2" color="text.secondary">
                            At least one language is required.
                        </Typography>
                        <TextField
                            name="canonicalDe"
                            label="German"
                            defaultValue={initialValues.canonicalDe}
                        />
                        <TextField
                            name="canonicalEn"
                            label="English"
                            defaultValue={initialValues.canonicalEn}
                        />
                    </Stack>
                </Paper>

                <Paper sx={{ p: 3 }} variant="outlined">
                    <Stack spacing={2}>
                        <Typography variant="h6">Classification</Typography>
                        <TextField
                            name="role"
                            label="Role"
                            select
                            defaultValue={initialValues.role}
                            required
                        >
                            <MenuItem value="starch">Starch</MenuItem>
                            <MenuItem value="vegetable">Vegetable</MenuItem>
                            <MenuItem value="protein">Protein</MenuItem>
                            <MenuItem value="none">
                                None (seasoning, dairy, …)
                            </MenuItem>
                        </TextField>
                        <TextField
                            name="density"
                            label="Density (g/ml, optional)"
                            defaultValue={initialValues.density}
                            helperText="e.g. flour ≈ 0.55, water = 1, olive oil ≈ 0.92"
                            inputMode="decimal"
                        />
                        <TextField
                            name="notes"
                            label="Notes"
                            defaultValue={initialValues.notes}
                            multiline
                            minRows={2}
                        />
                    </Stack>
                </Paper>

                <Paper sx={{ p: 3 }} variant="outlined">
                    <Stack spacing={2}>
                        <Typography variant="h6">Aliases</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Language-agnostic alternate names used only for
                            matching.
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
                                    No aliases yet.
                                </Typography>
                            ) : null}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField
                                label="Add alias"
                                value={aliasDraft}
                                onChange={(e) => setAliasDraft(e.target.value)}
                                onKeyDown={handleAliasKey}
                                fullWidth
                            />
                            <Button onClick={addAlias} variant="outlined">
                                Add
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
                        <Typography variant="h6">Count units</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Mass of one unit, e.g. one onion ≈ 150 g.
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
                                    label="Unit"
                                    placeholder="piece"
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
                                    label="g / unit"
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
                                    aria-label="Remove"
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
                                Add count unit
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
                        ? 'Saving…'
                        : initialValues.id === null
                          ? 'Create'
                          : 'Save'}
                </Button>
                <Button
                    onClick={() => router.push('/ingredients')}
                    variant="text"
                >
                    Cancel
                </Button>
                {initialValues.id !== null ? (
                    <DeleteButton id={initialValues.id} />
                ) : null}
            </Stack>
        </Stack>
    )
}

function DeleteButton({ id }: { id: IngredientId }) {
    return (
        <form
            action={deleteIngredientAction}
            onSubmit={(e) => {
                if (!confirm('Delete this ingredient?')) {
                    e.preventDefault()
                }
            }}
            style={{ marginLeft: 'auto' }}
        >
            <input type="hidden" name="id" value={id} />
            <Button type="submit" color="error" startIcon={<DeleteIcon />}>
                Delete
            </Button>
        </form>
    )
}
