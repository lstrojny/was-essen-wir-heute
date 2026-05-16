import { validate as uuidValidate, v7 as uuidv7 } from 'uuid'

declare const brand: unique symbol
type Brand<B extends string> = string & { readonly [brand]: B }

export type UserId = Brand<'UserId'>
export type IngredientId = Brand<'IngredientId'>
export type IngredientAliasId = Brand<'IngredientAliasId'>
export type IngredientCountUnitId = Brand<'IngredientCountUnitId'>
export type SessionId = Brand<'SessionId'>

export const newUserId = (): UserId => uuidv7() as UserId
export const newIngredientId = (): IngredientId => uuidv7() as IngredientId
export const newIngredientAliasId = (): IngredientAliasId =>
    uuidv7() as IngredientAliasId
export const newIngredientCountUnitId = (): IngredientCountUnitId =>
    uuidv7() as IngredientCountUnitId

export const parseUserId = (value: string): UserId | null =>
    uuidValidate(value) ? (value as UserId) : null

export const parseIngredientId = (value: string): IngredientId | null =>
    uuidValidate(value) ? (value as IngredientId) : null

const SHA256_HEX = /^[0-9a-f]{64}$/

export const parseSessionId = (value: string): SessionId | null =>
    SHA256_HEX.test(value) ? (value as SessionId) : null

export const asSessionId = (value: string): SessionId => value as SessionId
