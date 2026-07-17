import { render, screen } from '@testing-library/react'
import App from './App'

describe('制作工作台外壳', () => {
  it('展示排期优先的工作台标题与演示项目', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '制作工作台' })).toBeInTheDocument()
    expect(screen.getByText('P-3D-024 / MECH-01')).toBeInTheDocument()
  })
})
