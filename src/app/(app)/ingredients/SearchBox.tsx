'use client'

import SearchIcon from '@mui/icons-material/Search'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export function SearchBox({
    defaultValue,
    unusedOnly,
}: {
    defaultValue: string
    unusedOnly: boolean
}) {
    const t = useTranslations()
    const router = useRouter()
    const [value, setValue] = useState(defaultValue)

    function buildHref(query: string, unused: boolean): string {
        const params = new URLSearchParams()
        if (query) params.set('q', query)
        if (unused) params.set('unused', '1')
        const qs = params.toString()
        return qs ? `/ingredients?${qs}` : '/ingredients'
    }

    return (
        <Stack spacing={1}>
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    router.push(buildHref(value.trim(), unusedOnly))
                }}
            >
                <TextField
                    fullWidth
                    placeholder={t('ingredients.searchPlaceholder')}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
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
            <FormControlLabel
                control={
                    <Checkbox
                        checked={unusedOnly}
                        onChange={(e) =>
                            router.push(
                                buildHref(value.trim(), e.target.checked),
                            )
                        }
                    />
                }
                label={t('ingredients.filterUnusedOnly')}
            />
        </Stack>
    )
}
