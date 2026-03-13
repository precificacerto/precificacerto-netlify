import { Input, Form, FormInstance, Checkbox } from 'antd'

interface NewUsersFormProps {
  form: FormInstance<NewUser>
}

export interface NewUser {
  uid?: string
  email: string
  isActive?: boolean
}

const NewUsersForm = ({ form }: NewUsersFormProps) => {
  return (
    <Form layout="vertical" form={form}>
      <Form.Item name="uid" label="Id" hidden>
        <Input />
      </Form.Item>

      <Form.Item
        name="email"
        label="E-mail"
        rules={[
          { required: true },
          {
            type: 'email',
          },
        ]}
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="password"
        label="Senha"
        initialValue="change-me_123#"
        rules={[{ required: true }]}
      >
        <Input />
      </Form.Item>

      <Form.Item name="isActive" valuePropName="checked">
        <Checkbox defaultChecked>Ativo</Checkbox>
      </Form.Item>
    </Form>
  )
}

export { NewUsersForm }
