import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('制作工作台外壳', () => {
  it('展示排期优先的工作台标题与演示项目', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '制作工作台' })).toBeInTheDocument()
    expect(screen.getByText('P-3D-024 / MECH-01')).toBeInTheDocument()
  })

  it('将客户反馈转换为可确认的重排草案', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '查看影响并生成草案' }))
    expect(screen.getByText('低模、烘焙、贴图、LOD')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认 5 项排期修订' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认 5 项排期修订' }))
    expect(screen.getByText('已确认 1 次修订')).toBeInTheDocument()
  })
})
