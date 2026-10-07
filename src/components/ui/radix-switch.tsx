import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
// `motion/react` e `framer-motion` são o mesmo pacote renomeado; o projeto já usa
// framer-motion (AnimatedThemeToggler), então não entra dependência duplicada.
import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'

type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
  leftIcon?: React.ElementType
  rightIcon?: React.ElementType
  thumbIcon?: React.ElementType
}

const THUMB = 20
const THUMB_PRESSED = 24

/** Interruptor ativo/inativo (Radix + framer-motion). Controlado (`checked` +
 *  `onCheckedChange`) ou não (`defaultChecked`). Passe `aria-label` ou associe um
 *  <label htmlFor={id}> — o botão não tem texto próprio. */
const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, SwitchProps>(
  ({ className, style, leftIcon: LeftIcon, rightIcon: RightIcon, thumbIcon: ThumbIcon, ...props }, ref) => {
    const [isChecked, setIsChecked] = React.useState(props?.checked ?? props?.defaultChecked ?? false)
    const [isTapped, setIsTapped] = React.useState(false)

    React.useEffect(() => {
      setIsChecked(props?.checked ?? props?.defaultChecked ?? false)
    }, [props?.checked, props?.defaultChecked])

    return (
      <SwitchPrimitives.Root
        {...props}
        onCheckedChange={checked => {
          setIsChecked(checked)
          props.onCheckedChange?.(checked)
        }}
        asChild
      >
        <motion.button
          ref={ref}
          className={cn(
            'relative flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
            'disabled:cursor-not-allowed disabled:opacity-50',
            isChecked ? 'bg-primary' : 'bg-muted/25',
            className,
          )}
          style={{ ...style, justifyContent: isChecked ? 'flex-end' : 'flex-start' }}
          whileTap="tap"
          initial={false}
          onTapStart={() => setIsTapped(true)}
          onTapCancel={() => setIsTapped(false)}
          onTap={() => setIsTapped(false)}
        >
          {LeftIcon && (
            <motion.div
              animate={isChecked ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
              transition={{ type: 'spring', bounce: 0 }}
              className="absolute left-1 top-1/2 -translate-y-1/2 text-white/70"
            >
              <LeftIcon className="size-3" />
            </motion.div>
          )}

          {RightIcon && (
            <motion.div
              animate={isChecked ? { scale: 0, opacity: 0 } : { scale: 1, opacity: 1 }}
              transition={{ type: 'spring', bounce: 0 }}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted"
            >
              <RightIcon className="size-3" />
            </motion.div>
          )}

          <SwitchPrimitives.Thumb asChild>
            <motion.div
              className="relative z-10 flex items-center justify-center rounded-full bg-white text-muted shadow-lg ring-0"
              layout
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              style={{ width: THUMB, height: THUMB }}
              animate={
                isTapped
                  ? { width: THUMB_PRESSED, transition: { duration: 0.1 } }
                  : { width: THUMB, transition: { duration: 0.1 } }
              }
            >
              {ThumbIcon && <ThumbIcon className="size-3" />}
            </motion.div>
          </SwitchPrimitives.Thumb>
        </motion.button>
      </SwitchPrimitives.Root>
    )
  },
)
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch, type SwitchProps }
