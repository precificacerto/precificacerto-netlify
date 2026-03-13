export function parseJwt(token: string): FunctionResult {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
}

type FunctionResult = {
  user_id: string
}
