'use client'

import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { CuisineKey } from '@/db/ids'
import type { CuisineRow } from '@/recipes/queries'

export function RecipeListFilters({
    defaultSearch,
    defaultCuisineKey,
    defaultCompleteOnly,
    cuisines,
    activeLanguage,
}: {
    defaultSearch: string
    defaultCuisineKey: CuisineKey | null
    defaultCompleteOnly: boolean
    cuisines: CuisineRow[]
    activeLanguage: 'de' | 'en'
}) {
    const t = useTranslations()
    const router = useRouter()
    const [search, setSearch] = useState(defaultSearch)
    const [cuisine, setCuisine] = useState<string>(defaultCuisineKey ?? '')
    const [completeOnly, setCompleteOnly] = useState(defaultCompleteOnly)

    function submit(
        nextSearch: string,
        nextCuisine: string,
        nextCompleteOnly: boolean,
    ) {
        const params = new URLSearchParams()
        const s = nextSearch.trim()
        if (s) params.set('q', s)
        if (nextCuisine) params.set('cuisine', nextCuisine)
        if (nextCompleteOnly) params.set('complete', '1')
        const qs = params.toString()
        router.push(qs ? `/recipes?${qs}` : '/recipes')
    }

    return (
        <Box
            sx={{
                display: 'flex',
                gap: 2,
                flexWrap: 'wrap',
                alignItems: 'center',
            }}
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    submit(search, cuisine, completeOnly)
                }}
                style={{ flex: '1 1 240px' }}
            >
                <TextField
                    fullWidth
                    placeholder={t('recipes.searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    slotProps={{
                        input: {
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton type="submit" edge="end">
                                        <SearchIcon />
                                    </IconButton>
                                </InputAdornment>
                            ),
                        },
                    }}
                />
            </form>
            <TextField
                select
                label={t('recipes.cuisine')}
                value={cuisine}
                onChange={(e) => {
                    setCuisine(e.target.value)
                    submit(search, e.target.value, completeOnly)
                }}
                sx={{ minWidth: 200 }}
            >
                <MenuItem value="">{t('recipes.allCuisines')}</MenuItem>
                {cuisines.map((c) => (
                    <MenuItem key={c.key} value={c.key}>
                        {activeLanguage === 'de' ? c.labelDe : c.labelEn}
                    </MenuItem>
                ))}
            </TextField>
            <FormControlLabel
                control={
                    <Checkbox
                        checked={completeOnly}
                        onChange={(e) => {
                            setCompleteOnly(e.target.checked)
                            submit(search, cuisine, e.target.checked)
                        }}
                    />
                }
                label={t('recipes.onlyCompleteMeals')}
            />
        </Box>
    )
}
