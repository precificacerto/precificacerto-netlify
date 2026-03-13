import * as yup from 'yup'

export const userSchema = yup.object({
  uid: yup.string().required(),
  email: yup.string().email().required(),
  isActive: yup.boolean().required(),
  permissions: yup.array().of(yup.string()),
})

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IUserModel extends yup.InferType<typeof userSchema> {}
