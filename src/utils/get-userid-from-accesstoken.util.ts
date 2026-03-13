import { parseJwt } from './parse-jwt.util'

export function getUserIdFromAccessToken(token: string): string {
  return parseJwt(token).user_id
}
