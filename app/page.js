'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './page.module.css'

const commands = {
  next: 'sonraki',
  previous: 'önceki',
  repeat: 'tekrarla',
  readAll: 'tarifi baştan sona oku',
}

const LANGUAGE = 'tr-TR'

export default function Home() {
  const [recipe, setRecipe] = useState('')
  const [steps, setSteps] = useState([])
  const [currentStep, setCurrentStep] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const [isRecipeActive, setIsRecipeActive] = useState(false)
  const [voices, setVoices] = useState([])
  const [wakeLock, setWakeLock] = useState(null)

  const recognitionRef = useRef(null)
  const stateRef = useRef()
  stateRef.current = { steps, currentStep, isListening, isRecipeActive }

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        const lock = await navigator.wakeLock.request('screen')
        setWakeLock(lock)
        lock.addEventListener('release', () => {
          console.log('Wake Lock was released')
          setWakeLock(null)
        })
        console.log('Wake Lock is active')
      } catch (err) {
        console.error(`${err.name}, ${err.message}`)
      }
    }
  }, [])

  const releaseWakeLock = useCallback(async () => {
    if (wakeLock !== null) {
      await wakeLock.release()
      setWakeLock(null)
      console.log('Wake Lock released')
    }
  }, [wakeLock])

  useEffect(() => {
    const handleVoicesChanged = () => {
      setVoices(window.speechSynthesis.getVoices())
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)
      handleVoicesChanged()
    }
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.removeEventListener(
          'voiceschanged',
          handleVoicesChanged
        )
      }
    }
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      releaseWakeLock()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [wakeLock, requestWakeLock, releaseWakeLock])

  const startListening = useCallback(() => {
    const { isListening, isRecipeActive } = stateRef.current
    if (
      !isRecipeActive ||
      isListening ||
      typeof window === 'undefined' ||
      !('webkitSpeechRecognition' in window) ||
      window.speechSynthesis.speaking
    ) {
      return
    }
    if (recognitionRef.current) {
      recognitionRef.current.lang = LANGUAGE
      try {
        recognitionRef.current.start()
      } catch (error) {
        console.error('Recognition start error:', error)
      }
    }
  }, [])

  const speakText = useCallback(
    (text) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return

      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = LANGUAGE
      const turkishVoice = voices.find((voice) => voice.lang === 'tr-TR')
      if (turkishVoice) {
        utterance.voice = turkishVoice
      }
      utterance.onend = () => {
        if (stateRef.current.isRecipeActive) {
          startListening()
        }
      }
      window.speechSynthesis.speak(utterance)
    },
    [startListening, voices]
  )

  const handleVoiceCommand = useCallback(
    (command) => {
      const { steps, currentStep } = stateRef.current

      if (!commands) return

      const processedCommand = command.toLowerCase().trim()
      let commandFound = false

      if (processedCommand === commands.next) {
        const nextStep = currentStep + 1
        if (nextStep < steps.length) {
          setCurrentStep(nextStep)
          speakText(steps[nextStep])
        } else {
          speakText('Tarifin sonuna geldiniz.')
        }
        commandFound = true
      } else if (processedCommand === commands.previous) {
        const prevStep = currentStep - 1
        if (prevStep >= 0) {
          setCurrentStep(prevStep)
          speakText(steps[prevStep])
        } else {
          speakText('Şu an ilk adımdasınız.')
        }
        commandFound = true
      } else if (processedCommand === commands.repeat) {
        if (steps.length > 0) {
          speakText(steps[currentStep])
        }
        commandFound = true
      } else if (processedCommand === commands.readAll) {
        if (steps.length > 0) {
          const fullRecipe = steps.join(' ')
          speakText(fullRecipe)
        }
        commandFound = true
      }

      // If a valid command was spoken, the listener will be restarted by speakText's onend.
      // If not, the main onend handler will restart it.
    },
    [speakText]
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !('webkitSpeechRecognition' in window)) {
      console.log('Speech recognition not supported.')
      return
    }

    if (!recognitionRef.current) {
      recognitionRef.current = new window.webkitSpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
    }
    const recognition = recognitionRef.current

    const onResult = (event) =>
      handleVoiceCommand(event.results[0][0].transcript)
    const onEnd = () => {
      setIsListening(false)
      if (stateRef.current.isRecipeActive && !window.speechSynthesis.speaking) {
        setTimeout(() => startListening(), 50) // Use a small delay to prevent rapid-fire restarts
      }
    }
    const onError = (event) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
    }

    recognition.onstart = () => setIsListening(true)
    recognition.addEventListener('result', onResult)
    recognition.addEventListener('end', onEnd)
    recognition.addEventListener('error', onError)

    return () => {
      recognition.removeEventListener('result', onResult)
      recognition.removeEventListener('end', onEnd)
      recognition.removeEventListener('error', onError)
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      window.speechSynthesis.cancel()
    }
  }, [handleVoiceCommand, startListening])

  const processRecipe = () => {
    if (recipe.trim() === '') return
    requestWakeLock()
    const recipeSteps = recipe.split('\n').filter((line) => line.trim() !== '')
    setSteps(recipeSteps)
    setCurrentStep(0)
    setIsRecipeActive(true)
    if (recipeSteps.length > 0) {
      speakText(recipeSteps[0])
    }
  }

  const stopRecipe = () => {
    releaseWakeLock()
    setIsRecipeActive(false)
    setSteps([])
    setCurrentStep(0)
    window.speechSynthesis.cancel()
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }

  const handleStepClick = (index) => {
    setCurrentStep(index)
    speakText(steps[index])
  }

  useEffect(() => {
    if (isRecipeActive && steps.length > 0) {
      const activeStepElement = document.getElementById(`step-${currentStep}`)
      if (activeStepElement) {
        activeStepElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    }
  }, [currentStep, isRecipeActive, steps])

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Cook Pilot</h1>
      <p className={styles.description}>Sesli pişirme asistanı</p>

      {steps.length === 0 && (
        <>
          <p>Bulduğunuz yemek tarifini aşağıdaki metin alanına yapıştırın.</p>

          <textarea
            className={styles.textarea}
            value={recipe}
            onChange={(e) => setRecipe(e.target.value)}
            placeholder='Yemek tarifini buraya yapıştırın...'
            rows='15'
            disabled={isRecipeActive}
          />
        </>
      )}

      <div className={styles.buttonContainer}>
        {!isRecipeActive ? (
          <button onClick={processRecipe} className={styles.button} disabled={!recipe.trim()}>
            Başla
          </button>
        ) : (
          <button onClick={stopRecipe} className={`${styles.button} ${styles.stopButton}`}>
            Durdur
          </button>
        )}
      </div>

      {isListening && (
        <div className={styles.commandsContainer}>
          <p className={styles.commandsTitle}>Kullanılabilir sesli komutlar</p>
          <ul className={styles.commandsList}>
            {Object.values(commands).map((command, index) => (
              <li key={index} className={styles.commandItem}>
                {command}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isRecipeActive && steps.length > 0 && (
        <>
          <div className={styles.stepsContainer}>
            <h2>Tarif Adımları</h2>
            <ul className={styles.stepsList}>
              {steps.map((step, index) => (
                <li
                  id={`step-${index}`}
                  key={index}
                  className={index === currentStep ? styles.activeStep : ''}
                  onClick={() => handleStepClick(index)}
                >
                  {step}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <small className={styles.footer}>
        <a href='https://github.com/gayret'>Safa Gayret</a> tarafından geliştirildi.
        <br />
        <br />
        Uygulamanın hikayesi{' '}
        <a href='https://safa.medium.com/sesli-pi%C5%9Firme-asistan%C4%B1-cook-pilot-78cee5e3dafb'>
          burada.
        </a>
      </small>
    </main>
  )
}
