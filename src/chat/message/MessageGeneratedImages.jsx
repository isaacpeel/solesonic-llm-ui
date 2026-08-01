import GeneratedImage from '../../image/GeneratedImage.jsx';
import './MessageGeneratedImages.css';

/*
 * Images attached to an assistant turn. No regenerate action here — there is no prompt box
 * to re-run, and the turn is already persisted.
 */
function MessageGeneratedImages({images}) {
    const imageList = Array.isArray(images) ? images : [];

    if (imageList.length === 0) {
        return null;
    }

    return (
        <div className="message-generated-images">
            {imageList.map((image) => (
                <GeneratedImage key={image.imageId} image={image}/>
            ))}
        </div>
    );
}

export default MessageGeneratedImages;
