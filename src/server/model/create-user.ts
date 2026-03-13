import * as yup from 'yup'

export const createUserSchema = yup.object({
  email: yup.string().email().required(),
  isActive: yup.boolean().required(),
  password: yup.string().required().min(8),
})

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ICreateUserModel extends yup.InferType<typeof createUserSchema> {}
