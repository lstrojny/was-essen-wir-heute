'use client'

import Box from '@mui/material/Box'
import { useEffect, useState } from 'react'
import { ChatSidebar } from './ChatSidebar'

const STORAGE_KEY = 'wewh.chatPaneWidth'
const MIN_WIDTH = 280
const MAX_WIDTH = 720
const DEFAULT_WIDTH = 360

export function ChatPane() {
    const [width, setWidth] = useState<number>(DEFAULT_WIDTH)

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY)
            if (raw) {
                const n = Number(raw)
                if (Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) {
                    setWidth(n)
                }
            }
        } catch {
            // ignore (private mode etc.)
        }
    }, [])

    function startDrag(e: React.MouseEvent) {
        e.preventDefault()
        const startX = e.clientX
        const startWidth = width
        document.body.style.cursor = 'ew-resize'
        document.body.style.userSelect = 'none'

        function onMove(ev: MouseEvent) {
            const dx = startX - ev.clientX
            const next = Math.min(
                MAX_WIDTH,
                Math.max(MIN_WIDTH, startWidth + dx),
            )
            setWidth(next)
        }

        function onUp() {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            try {
                window.localStorage.setItem(STORAGE_KEY, String(width))
            } catch {
                // ignore
            }
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, String(width))
        } catch {
            // ignore
        }
    }, [width])

    return (
        <Box
            component="aside"
            sx={{
                width,
                flexShrink: 0,
                borderLeft: 1,
                borderColor: 'divider',
                display: { xs: 'none', md: 'flex' },
                position: 'sticky',
                top: 64,
                alignSelf: 'flex-start',
                height: 'calc(100vh - 64px)',
                bgcolor: 'background.paper',
            }}
        >
            <Box
                onMouseDown={startDrag}
                sx={{
                    width: 6,
                    cursor: 'ew-resize',
                    flexShrink: 0,
                    backgroundColor: 'transparent',
                    transition: 'background-color 120ms',
                    '&:hover': {
                        backgroundColor: 'action.hover',
                    },
                }}
                aria-label="Resize chat sidebar"
                role="separator"
            />
            <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex' }}>
                <ChatSidebar />
            </Box>
        </Box>
    )
}
