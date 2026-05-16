'use client'

import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
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
    cuisines,
    activeLanguage,
}: {
    defaultSearch: string
    defaultCuisineKey: CuisineKey | null
    cuisines: CuisineRow[]
    activeLanguage: 'de' | 'en'
}) {
    const t = useTranslations()
    const router = useRouter()
    const [search, setSearch] = useState(defaultSearch)
    const [cuisine, setCuisine] = useState<string>(defaultCuisineKey ?? '')

    function submit(nextSearch: string, nextCuisine: string) {
        const params = new URLSearchParams()
        const s = nextSearch.trim()
        if (s) params.set('q', s)
        if (nextCuisine) params.set('cuisine', nextCuisine)
        const qs = params.toString()
        router.push(qs ? `/recipes?${qs}` : '/recipes')
    }

    return (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    submit(search, cuisine)
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
                    submit(search, e.target.value)
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
        </Box>
    )
}
