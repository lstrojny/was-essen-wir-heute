import { validate as uuidValidate, v7 as uuidv7 } from 'uuid'

declare const brand: unique symbol
type Brand<B extends string> = string & { readonly [brand]: B }

export type UserId = Brand<'UserId'>
export type IngredientId = Brand<'IngredientId'>
export type IngredientAliasId = Brand<'IngredientAliasId'>
export type IngredientCountUnitId = Brand<'IngredientCountUnitId'>
export type SessionId = Brand<'SessionId'>
export type RecipeId = Brand<'RecipeId'>
export type RecipeStepId = Brand<'RecipeStepId'>
export type RecipeIngredientId = Brand<'RecipeIngredientId'>
export type RecipeComponentId = Brand<'RecipeComponentId'>
export type RecipeRatingId = Brand<'RecipeRatingId'>
export type CuisineKey = Brand<'CuisineKey'>

export const newUserId = (): UserId => uuidv7() as UserId
export const newIngredientId = (): IngredientId => uuidv7() as IngredientId
export const newIngredientAliasId = (): IngredientAliasId =>
    uuidv7() as IngredientAliasId
export const newIngredientCountUnitId = (): IngredientCountUnitId =>
    uuidv7() as IngredientCountUnitId
export const newRecipeId = (): RecipeId => uuidv7() as RecipeId
export const newRecipeStepId = (): RecipeStepId => uuidv7() as RecipeStepId
export const newRecipeIngredientId = (): RecipeIngredientId =>
    uuidv7() as RecipeIngredientId
export const newRecipeComponentId = (): RecipeComponentId =>
    uuidv7() as RecipeComponentId
export const newRecipeRatingId = (): RecipeRatingId =>
    uuidv7() as RecipeRatingId

export const parseUserId = (value: string): UserId | null =>
    uuidValidate(value) ? (value as UserId) : null

export const parseIngredientId = (value: string): IngredientId | null =>
    uuidValidate(value) ? (value as IngredientId) : null

export const parseRecipeId = (value: string): RecipeId | null =>
    uuidValidate(value) ? (value as RecipeId) : null

const CUISINE_KEY_RE = /^[a-z][a-z0-9-]{1,30}$/

export const parseCuisineKey = (value: string): CuisineKey | null =>
    CUISINE_KEY_RE.test(value) ? (value as CuisineKey) : null

export const asCuisineKey = (value: string): CuisineKey => value as CuisineKey

const SHA256_HEX = /^[0-9a-f]{64}$/

export const parseSessionId = (value: string): SessionId | null =>
    SHA256_HEX.test(value) ? (value as SessionId) : null

export const asSessionId = (value: string): SessionId => value as SessionId
