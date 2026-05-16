'use client'

import SearchIcon from '@mui/icons-material/Search'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SearchBox({ defaultValue }: { defaultValue: string }) {
    const router = useRouter()
    const [value, setValue] = useState(defaultValue)
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                const trimmed = value.trim()
                router.push(
                    trimmed
                        ? `/ingredients?q=${encodeURIComponent(trimmed)}`
                        : '/ingredients',
                )
            }}
        >
            <TextField
                fullWidth
                placeholder="Search canonical names or aliases…"
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
    )
}
