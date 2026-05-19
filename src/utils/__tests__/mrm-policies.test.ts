/**
 * Tests — MRM Policies (Story MRM-V2-S2.3)
 *
 * Cobertura da matriz de decisão (ADR-004):
 *   - 3 document types × 2 estados RRO ≤ 0 (RRO_ZERO + RRO_NEGATIVE)
 *   - VALID em qualquer documento → allow
 *   - ERROR em qualquer documento → block_save
 *   - Tenant overrides 'strict' e 'permissive'
 *   - Pureza (mesmo input → mesmo output)
 */

import {
  decideMrmAction,
  MRM_POLICY_MESSAGES,
  type DocumentType,
  type MotorResultLike,
  type PolicyInput,
} from '../mrm-policies'
import type { ReapurationStatus } from '@/types/mrm'

function motor(status: ReapurationStatus, rro = 0): MotorResultLike {
  return { status, rro }
}

function input(overrides: Partial<PolicyInput> & Pick<PolicyInput, 'documentType' | 'motorResult'>): PolicyInput {
  return overrides
}

describe('decideMrmAction — defaults ADR-004 (sem tenant override)', () => {
  describe('sales', () => {
    it('TC1 — sale + RRO_ZERO → block_save', () => {
      const decision = decideMrmAction(
        input({ motorResult: motor('RRO_ZERO', 0), documentType: 'sale' })
      )
      expect(decision.action).toBe('block_save')
      expect(decision.requires_review).toBe(true)
      expect(decision.message).toBe(MRM_POLICY_MESSAGES.BLOCK_SALE)
    })

    it('TC2 — sale + RRO_NEGATIVE → block_save', () => {
      const decision = decideMrmAction(
        input({ motorResult: motor('RRO_NEGATIVE', -100), documentType: 'sale' })
      )
      expect(decision.action).toBe('block_save')
      expect(decision.requires_review).toBe(true)
      expect(decision.message).toBe(MRM_POLICY_MESSAGES.BLOCK_SALE)
    })

    it('TC3 — sale + VALID → allow', () => {
      const decision = decideMrmAction(
        input({ motorResult: motor('VALID', 500), documentType: 'sale' })
      )
      expect(decision.action).toBe('allow')
      expect(decision.requires_review).toBe(false)
      expect(decision.message).toBe('')
    })
  })

  describe('budgets', () => {
    it('TC4 — budget + RRO_ZERO → warn (+ requires_review)', () => {
      const decision = decideMrmAction(
        input({ motorResult: motor('RRO_ZERO', 0), documentType: 'budget' })
      )
      expect(decision.action).toBe('warn')
      expect(decision.requires_review).toBe(true)
      expect(decision.message).toBe(MRM_POLICY_MESSAGES.WARN_BUDGET_ORDER)
    })

    it('TC5 — budget + RRO_NEGATIVE → warn (+ requires_review)', () => {
      const decision = decideMrmAction(
        input({ motorResult: motor('RRO_NEGATIVE', -50), documentType: 'budget' })
      )
      expect(decision.action).toBe('warn')
      expect(decision.requires_review).toBe(true)
    })

    it('TC6 — budget + VALID → allow', () => {
      const decision = decideMrmAction(
        input({ motorResult: motor('VALID', 1000), documentType: 'budget' })
      )
      expect(decision.action).toBe('allow')
      expect(decision.requires_review).toBe(false)
    })
  })

  describe('orders', () => {
    it('TC7 — order + RRO_NEGATIVE → warn', () => {
      const decision = decideMrmAction(
        input({ motorResult: motor('RRO_NEGATIVE', -1), documentType: 'order' })
      )
      expect(decision.action).toBe('warn')
      expect(decision.requires_review).toBe(true)
    })

    it('TC8 — order + VALID → allow', () => {
      const decision = decideMrmAction(
        input({ motorResult: motor('VALID', 200), documentType: 'order' })
      )
      expect(decision.action).toBe('allow')
      expect(decision.requires_review).toBe(false)
    })
  })
})

describe('decideMrmAction — estados especiais', () => {
  it('ERROR em qualquer documento bloqueia por segurança', () => {
    for (const docType of ['budget', 'order', 'sale'] as DocumentType[]) {
      const decision = decideMrmAction(
        input({ motorResult: motor('ERROR', 0), documentType: docType })
      )
      expect(decision.action).toBe('block_save')
      expect(decision.requires_review).toBe(true)
      expect(decision.message).toBe(MRM_POLICY_MESSAGES.BLOCK_ERROR)
    }
  })

  it('PENDING não dispara bloqueio nem aviso (motor antigo)', () => {
    const decision = decideMrmAction(
      input({ motorResult: motor('PENDING', 0), documentType: 'sale' })
    )
    expect(decision.action).toBe('allow')
    expect(decision.requires_review).toBe(false)
  })
})

describe('decideMrmAction — tenant overrides', () => {
  it("'strict' bloqueia até budgets quando RRO_NEGATIVE", () => {
    const decision = decideMrmAction(
      input({
        motorResult: motor('RRO_NEGATIVE', -10),
        documentType: 'budget',
        tenantSettings: { rro_policy: 'strict' },
      })
    )
    expect(decision.action).toBe('block_save')
    expect(decision.requires_review).toBe(true)
  })

  it("'permissive' apenas avisa em sales quando RRO_NEGATIVE", () => {
    const decision = decideMrmAction(
      input({
        motorResult: motor('RRO_NEGATIVE', -10),
        documentType: 'sale',
        tenantSettings: { rro_policy: 'permissive' },
      })
    )
    expect(decision.action).toBe('warn')
    expect(decision.requires_review).toBe(true)
  })

  it("'strict' NÃO altera VALID — sempre permite", () => {
    const decision = decideMrmAction(
      input({
        motorResult: motor('VALID', 100),
        documentType: 'sale',
        tenantSettings: { rro_policy: 'strict' },
      })
    )
    expect(decision.action).toBe('allow')
    expect(decision.requires_review).toBe(false)
  })
})

describe('decideMrmAction — pureza', () => {
  it('mesmo input → mesmo output (deep equal)', () => {
    const p: PolicyInput = {
      motorResult: motor('RRO_NEGATIVE', -50),
      documentType: 'budget',
    }
    const d1 = decideMrmAction(p)
    const d2 = decideMrmAction(p)
    expect(d1).toEqual(d2)
  })
})
