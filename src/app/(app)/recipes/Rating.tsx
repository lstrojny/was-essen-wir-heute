'use client'

import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import StarHalfIcon from '@mui/icons-material/StarHalf'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import type { RecipeId } from '@/db/ids'
import { clearRatingAction, setRatingAction } from '@/recipes/rating-actions'

const STAR_VALUES = [1, 2, 3, 4, 5] as const

type Size = 'small' | 'medium'

function starFontSize(size: Size): 'small' | 'medium' {
    return size === 'small' ? 'small' : 'medium'
}

function StarRow({
    fontSize,
    children,
    onMouseLeave,
    ariaLabel,
}: {
    fontSize: 'small' | 'medium'
    children: React.ReactNode
    onMouseLeave?: () => void
    ariaLabel?: string
}) {
    return (
        <Box
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 0,
            }}
            onMouseLeave={onMouseLeave}
            aria-label={ariaLabel}
            data-size={fontSize}
        >
            {children}
        </Box>
    )
}

export function AggregateRating({
    average,
    count,
    size = 'medium',
    showCount = true,
}: {
    average: number | null
    count: number
    size?: Size
    showCount?: boolean
}) {
    const t = useTranslations()
    const format = useFormatter()
    if (average === null || count === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                {t('recipes.rating.notRated')}
            </Typography>
        )
    }
    const fontSize = starFontSize(size)
    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <StarRow fontSize={fontSize}>
                {STAR_VALUES.map((star) => {
                    const diff = average - star + 1
                    if (diff >= 0.75) {
                        return (
                            <StarIcon
                                key={star}
                                fontSize={fontSize}
                                sx={{ color: 'warning.main' }}
                            />
                        )
                    }
                    if (diff >= 0.25) {
                        return (
                            <StarHalfIcon
                                key={star}
                                fontSize={fontSize}
                                sx={{ color: 'warning.main' }}
                            />
                        )
                    }
                    return (
                        <StarBorderIcon
                            key={star}
                            fontSize={fontSize}
                            sx={{ color: 'warning.main' }}
                        />
                    )
                })}
            </StarRow>
            <Typography variant="body2">
                {format.number(average, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                })}
            </Typography>
            {showCount ? (
                <Typography variant="body2" color="text.secondary">
                    {t('recipes.rating.countSuffix', { count })}
                </Typography>
            ) : null}
        </Box>
    )
}

export function RatingControl({
    recipeId,
    initialScore,
    aggregateAverage,
    aggregateCount,
    size = 'medium',
}: {
    recipeId: RecipeId
    initialScore: number | null
    aggregateAverage: number | null
    aggregateCount: number
    size?: Size
}) {
    const t = useTranslations()
    const format = useFormatter()
    const [score, setScore] = useState<number | null>(initialScore)
    const [hover, setHover] = useState<number | null>(null)
    const [isHovering, setIsHovering] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const fontSize = starFontSize(size)

    function submitScore(next: number) {
        if (isPending) return
        const previous = score
        const clearing = next === score
        setScore(clearing ? null : next)
        setError(null)
        startTransition(async () => {
            const data = new FormData()
            data.set('recipeId', recipeId)
            if (clearing) {
                const result = await clearRatingAction({}, data)
                if (result.error) {
                    setScore(previous)
                    setError(result.error)
                }
                return
            }
            data.set('score', String(next))
            const result = await setRatingAction({}, data)
            if (result.error) {
                setScore(previous)
                setError(result.error)
            }
        })
    }

    const interactive = isHovering || score === null
    const previewScore = hover ?? score
    const showAggregateText = !interactive && score !== null

    function renderStar(star: number) {
        if (interactive) {
            const filled = previewScore !== null && star <= previewScore
            return filled ? (
                <StarIcon fontSize={fontSize} sx={{ color: 'warning.main' }} />
            ) : (
                <StarBorderIcon
                    fontSize={fontSize}
                    sx={{ color: 'warning.main' }}
                />
            )
        }
        const avg = aggregateAverage ?? 0
        const diff = avg - star + 1
        if (diff >= 0.75) {
            return (
                <StarIcon fontSize={fontSize} sx={{ color: 'warning.main' }} />
            )
        }
        if (diff >= 0.25) {
            return (
                <StarHalfIcon
                    fontSize={fontSize}
                    sx={{ color: 'warning.main' }}
                />
            )
        }
        return (
            <StarBorderIcon
                fontSize={fontSize}
                sx={{ color: 'warning.main' }}
            />
        )
    }

    return (
        <Box
            sx={{ display: 'inline-flex', flexDirection: 'column', gap: 0.25 }}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => {
                setIsHovering(false)
                setHover(null)
            }}
        >
            <Box
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                }}
            >
                <StarRow
                    fontSize={fontSize}
                    ariaLabel={t('recipes.rating.yourRatingLabel')}
                >
                    {STAR_VALUES.map((star) => (
                        <Box
                            key={star}
                            component="span"
                            role="button"
                            tabIndex={0}
                            aria-label={
                                score === star
                                    ? t('recipes.rating.clearHint')
                                    : t('recipes.rating.setHint', {
                                          score: star,
                                      })
                            }
                            onMouseEnter={() => setHover(star)}
                            onClick={() => submitScore(star)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    submitScore(star)
                                }
                            }}
                            sx={{
                                display: 'inline-flex',
                                cursor: isPending ? 'wait' : 'pointer',
                                lineHeight: 0,
                                opacity: isPending ? 0.6 : 1,
                                '&:focus-visible': {
                                    outline: '2px solid',
                                    outlineColor: 'primary.main',
                                    borderRadius: '4px',
                                },
                            }}
                        >
                            {renderStar(star)}
                        </Box>
                    ))}
                </StarRow>
                {aggregateAverage !== null && aggregateCount > 0 ? (
                    <Box
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            visibility: showAggregateText
                                ? 'visible'
                                : 'hidden',
                        }}
                        aria-hidden={!showAggregateText}
                    >
                        <Typography variant="body2">
                            {format.number(aggregateAverage, {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                            })}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('recipes.rating.countSuffix', {
                                count: aggregateCount,
                            })}
                        </Typography>
                    </Box>
                ) : null}
            </Box>
            {error ? (
                <Typography variant="caption" color="error">
                    {error}
                </Typography>
            ) : null}
        </Box>
    )
}
