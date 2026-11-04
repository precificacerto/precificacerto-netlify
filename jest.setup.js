/* global beforeEach, afterEach, expect */
// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Used for __tests__/testing-library.js
// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Portão de rede: nenhum teste abre conexão fora do loopback. A tentativa é bloqueada e o teste FALHA
// (dono do produto, 04/11/2026; o porquê está no módulo).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const portaoDeRede = require('./scripts/jest/portao-de-rede')
portaoDeRede.instalar()
beforeEach(() => portaoDeRede.zerar())
afterEach(() => {
    const violacoes = portaoDeRede.colher()
    if (violacoes.length) throw new Error(portaoDeRede.mensagem(violacoes, expect.getState().currentTestName))
})
