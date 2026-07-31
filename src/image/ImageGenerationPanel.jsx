import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowLeftIcon} from '@heroicons/react/20/solid';
import useImageGeneration, {COMPLETED, FAILED, GENERATING} from '../hooks/useImageGeneration.js';
import GeneratedImage from './GeneratedImage.jsx';
import GeneratedImageProgress from './GeneratedImageProgress.jsx';
import './ImageGenerationPanel.css';

/*
 * Explicit generation (Mode 1): the prompt goes straight to the images endpoint and no LLM
 * is involved, so nothing here can put image bytes into a conversation's context.
 */
function ImageGenerationPanel() {
    const [promptValue, setPromptValue] = useState('');
    const navigate = useNavigate();
    const {
        status,
        progressPercent,
        progressMessage,
        generatedImage,
        errorMessage,
        generate,
        regenerate,
        cancel,
    } = useImageGeneration();

    const isGenerating = status === GENERATING;
    const canSubmit = promptValue.trim().length > 0 && !isGenerating;

    const handleSubmit = (event) => {
        event.preventDefault();

        if (!canSubmit) {
            return;
        }

        void generate(promptValue);
    };

    return (
        <div className="image-generation-panel">
            <div className="image-generation-header">
                {/*
                  * Chat state lives in SharedDataContext above the router, so going back
                  * restores the conversation exactly as it was left.
                  */}
                <button type="button" className="image-generation-back" onClick={() => navigate('/')}>
                    <ArrowLeftIcon aria-hidden="true"/>
                    Back to chat
                </button>

                <h2 className="image-generation-title">Generate an image</h2>
            </div>

            <form className="image-generation-form" onSubmit={handleSubmit}>
                <label className="image-generation-label" htmlFor="image-generation-prompt">
                    Describe the image — subject, style, lighting, and composition.
                </label>

                <textarea
                    id="image-generation-prompt"
                    className="image-generation-prompt"
                    value={promptValue}
                    onChange={(event) => setPromptValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            handleSubmit(event);
                        }
                    }}
                    placeholder="a lighthouse on a cliff in a storm, dramatic lighting, photorealistic"
                    rows={3}
                    disabled={isGenerating}
                />

                <button type="submit" className="image-generation-submit" disabled={!canSubmit}>
                    {isGenerating ? 'Generating…' : 'Generate'}
                </button>
            </form>

            <div className="image-generation-output">
                {isGenerating && (
                    <GeneratedImageProgress
                        progressMessage={progressMessage}
                        progressPercent={progressPercent}
                        onCancel={cancel}
                    />
                )}

                {status === FAILED && (
                    <div className="image-generation-error" role="alert">
                        <p className="image-generation-error-message">{errorMessage}</p>
                        <button
                            type="button"
                            className="image-generation-retry"
                            onClick={regenerate}
                        >
                            Try again
                        </button>
                    </div>
                )}

                {status === COMPLETED && generatedImage && (
                    <>
                        <GeneratedImage
                            image={generatedImage}
                            onRegenerate={regenerate}
                            regenerating={isGenerating}
                        />
                        {/*
                          * The seed is fresh-random per call and not caller-tunable, so a
                          * regenerate is a new image rather than a retry of this one.
                          */}
                        <p className="image-generation-prompt-echo">{generatedImage.prompt}</p>
                    </>
                )}
            </div>
        </div>
    );
}

export default ImageGenerationPanel;
